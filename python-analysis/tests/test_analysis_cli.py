"""Tests the stdin/stdout JSON contract by running analysis.py exactly as Node.js does."""
import json
import os
import subprocess
import sys

SCRIPT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "analysis.py")


def run_cli(stdin_text):
    proc = subprocess.run(
        [sys.executable, SCRIPT], input=stdin_text, capture_output=True, text=True, timeout=30
    )
    return proc


def reply_of(stdin_text):
    proc = run_cli(stdin_text)
    assert proc.returncode == 0, proc.stderr
    return json.loads(proc.stdout)  # stdout must be exactly one JSON document


def test_ping_returns_pong():
    reply = reply_of(json.dumps({"operation": "ping"}))
    assert reply["ok"] is True
    assert reply["result"]["message"] == "pong"


def test_env_check_reports_library_versions():
    reply = reply_of(json.dumps({"operation": "env_check"}))
    assert reply["ok"] is True
    assert reply["result"]["numpy"]
    assert reply["result"]["pandas"]


def test_unknown_operation_is_reported_as_json_error():
    reply = reply_of(json.dumps({"operation": "make_coffee"}))
    assert reply["ok"] is False
    assert reply["error"] == "UnknownOperation"
    assert "ping" in reply["message"]


def test_missing_operation_field():
    reply = reply_of(json.dumps({"transactions": []}))
    assert reply["ok"] is False
    assert reply["error"] == "InvalidInput"


def test_invalid_json_input():
    reply = reply_of("{not json")
    assert reply["ok"] is False
    assert reply["error"] == "InvalidInput"


def test_empty_stdin():
    reply = reply_of("")
    assert reply["ok"] is False
    assert reply["error"] == "InvalidInput"


def test_non_object_json_is_rejected():
    reply = reply_of("[1, 2, 3]")
    assert reply["ok"] is False
    assert reply["error"] == "InvalidInput"


def test_stdout_contains_only_json_even_if_handler_prints(monkeypatch, capsys):
    """A stray print() inside a handler must not reach stdout (it is diverted to stderr)."""
    import analysis

    def noisy(request):
        print("this must not appear on stdout")
        return {"x": 1}

    monkeypatch.setitem(analysis.OPERATIONS, "noisy", noisy)
    response = analysis.handle(json.dumps({"operation": "noisy"}))
    captured = capsys.readouterr()
    assert response == {"ok": True, "result": {"x": 1}}
    assert captured.out == ""
    assert "this must not appear on stdout" in captured.err


def test_unexpected_exception_becomes_json_error(monkeypatch):
    import analysis

    def boom(request):
        raise RuntimeError("boom")

    monkeypatch.setitem(analysis.OPERATIONS, "boom", boom)
    response = analysis.handle(json.dumps({"operation": "boom"}))
    assert response["ok"] is False
    assert response["error"] == "InternalError"
    assert "boom" in response["message"]


def test_nan_in_result_does_not_produce_invalid_json(monkeypatch):
    """NaN is not valid JSON; main() must fall back to a JSON error instead."""
    import analysis

    monkeypatch.setitem(analysis.OPERATIONS, "nan_op", lambda r: {"x": float("nan")})
    monkeypatch.setattr(sys, "stdin", __import__("io").StringIO(json.dumps({"operation": "nan_op"})))
    out = __import__("io").StringIO()
    monkeypatch.setattr(sys, "stdout", out)
    analysis.main()
    reply = json.loads(out.getvalue())
    assert reply["ok"] is False
    assert reply["error"] == "InternalError"


# ---------------------------------------------------------------------------
# env_check must be fast: it reads package metadata and never imports the heavy libraries.
# (Regression tests for a 30 s timeout caused by importing numpy + pandas + scikit-learn.)
# ---------------------------------------------------------------------------
ANALYSIS_DIR = os.path.dirname(SCRIPT)


def test_env_check_does_not_import_heavy_libraries():
    """Deterministic, machine-speed-independent guard: run in a FRESH interpreter and
    assert that none of the heavy packages ended up in sys.modules."""
    code = (
        "import sys, json\n"
        f"sys.path.insert(0, {ANALYSIS_DIR!r})\n"
        "import analysis\n"
        "reply = analysis.handle(json.dumps({'operation': 'env_check'}))\n"
        "heavy = [m for m in ('numpy', 'pandas', 'sklearn', 'scipy') if m in sys.modules]\n"
        "print(json.dumps({'ok': reply['ok'], 'heavy': heavy}))\n"
    )
    proc = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, timeout=30)
    assert proc.returncode == 0, proc.stderr
    out = json.loads(proc.stdout)
    assert out["ok"] is True
    assert out["heavy"] == [], f"env_check imported heavy libraries: {out['heavy']}"


def test_env_check_reply_shape_is_unchanged():
    reply = reply_of(json.dumps({"operation": "env_check"}))
    assert reply["ok"] is True
    assert set(reply["result"]) == {"python", "numpy", "pandas", "scikit-learn"}
    assert reply["result"]["python"].count(".") == 2


def test_env_check_version_matches_the_imported_module():
    """The metadata version must equal what the library itself reports (numpy only: the lightest check)."""
    import numpy

    reply = reply_of(json.dumps({"operation": "env_check"}))
    assert reply["result"]["numpy"] == numpy.__version__


def test_env_check_reports_missing_required_dependency(monkeypatch):
    import analysis

    real = analysis.metadata.version

    def fake_version(name):
        if name == "pandas":
            raise analysis.metadata.PackageNotFoundError(name)
        return real(name)

    monkeypatch.setattr(analysis.metadata, "version", fake_version)
    response = analysis.handle(json.dumps({"operation": "env_check"}))
    assert response["ok"] is False
    assert response["error"] == "MissingDependency"
    assert "pandas" in response["message"]
    assert "numpy" not in response["message"]  # only the missing package is named
    assert "pip install -r python-analysis/requirements.txt" in response["message"]


def test_env_check_names_every_missing_required_dependency(monkeypatch):
    import analysis

    def always_missing(name):
        raise analysis.metadata.PackageNotFoundError(name)

    monkeypatch.setattr(analysis.metadata, "version", always_missing)
    response = analysis.handle(json.dumps({"operation": "env_check"}))
    assert response["error"] == "MissingDependency"
    assert "numpy" in response["message"] and "pandas" in response["message"]


def test_env_check_treats_metadata_without_files_as_missing(monkeypatch):
    """A broken install (metadata present, package files gone) must not be reported as installed."""
    import analysis

    real = analysis.importlib.util.find_spec
    monkeypatch.setattr(
        analysis.importlib.util, "find_spec", lambda name, *a, **k: None if name == "numpy" else real(name, *a, **k)
    )
    response = analysis.handle(json.dumps({"operation": "env_check"}))
    assert response["ok"] is False
    assert response["error"] == "MissingDependency"
    assert "numpy" in response["message"]


def test_env_check_optional_scikit_learn_may_be_absent(monkeypatch):
    import analysis

    real = analysis.metadata.version

    def fake_version(name):
        if name == "scikit-learn":
            raise analysis.metadata.PackageNotFoundError(name)
        return real(name)

    monkeypatch.setattr(analysis.metadata, "version", fake_version)
    response = analysis.handle(json.dumps({"operation": "env_check"}))
    assert response["ok"] is True
    assert response["result"]["scikit-learn"] is None
    assert response["result"]["numpy"] and response["result"]["pandas"]
