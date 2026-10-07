#!/usr/bin/env python3
"""Command-line entry point for Artha's Python analysis module.

This is NOT a web server. Node.js runs it as a child process (child_process.execFile):

    Node.js --(JSON on stdin)--> analysis.py --(JSON on stdout)--> Node.js

Request  : {"operation": "<name>", ...payload}
Success  : {"ok": true,  "result": {...}}
Failure  : {"ok": false, "error": "<Code>", "message": "<text>"}

Rules that make the contract safe:
  * stdout carries exactly one JSON document and nothing else. Anything a handler
    prints is diverted to stderr.
  * Every failure, including unexpected exceptions, is reported as JSON. The
    process exits 0 for any reply it managed to write.
  * Heavy libraries (pandas, numpy) are imported inside the handlers that need them,
    so lightweight operations such as "ping" and "env_check" start quickly.

Operations are registered in OPERATIONS. EDA is implemented in the separate
preprocessing.py and eda.py modules; regression remains future work.
"""
import contextlib
import importlib.util
import json
import platform
import sys
from importlib import metadata

from errors import AnalysisError


def op_ping(request):
    """Cheap liveness check (no pandas import)."""
    return {"message": "pong", "python": platform.python_version()}


# Packages the analysis code needs / may use: pip distribution name -> importable module name.
REQUIRED_PACKAGES = {"numpy": "numpy", "pandas": "pandas"}
# scikit-learn is optional (only used to cross-check regression in tests).
OPTIONAL_PACKAGES = {"scikit-learn": "sklearn"}


def _installed_version(dist_name: str, module_name: str):
    """Return the installed version string, or None if the package is not usable.

    Reads the package METADATA instead of importing the package. Importing numpy/pandas
    (and especially scikit-learn, which pulls in scipy) loads over a thousand modules and
    can take seconds, or far longer on a cold or antivirus-scanned disk, just to learn a
    version number. find_spec() only LOCATES the top-level module without executing it, so
    a half-deleted install (metadata left behind, files gone) is still reported as missing.
    """
    try:
        version = metadata.version(dist_name)
    except metadata.PackageNotFoundError:
        return None
    if importlib.util.find_spec(module_name) is None:
        return None
    return version


def op_env_check(request):
    """Report installed library versions so setup problems are easy to diagnose.

    Fast by design: no heavy library is imported. This checks that the packages are
    INSTALLED (and locatable); it does not prove they import without error. The analysis
    operations that actually use them import them lazily and report any
    import failure through the normal JSON error reply.
    """
    versions = {"python": platform.python_version()}

    missing = []
    for dist_name, module_name in REQUIRED_PACKAGES.items():
        version = _installed_version(dist_name, module_name)
        if version is None:
            missing.append(dist_name)
        versions[dist_name] = version
    if missing:
        raise AnalysisError(
            "MissingDependency",
            "Required Python package(s) not installed: "
            + ", ".join(missing)
            + ". Run: pip install -r python-analysis/requirements.txt",
        )

    for dist_name, module_name in OPTIONAL_PACKAGES.items():
        versions[dist_name] = _installed_version(dist_name, module_name)  # None if absent
    return versions


def op_eda(request):
    """Preprocess financial records and return deterministic exploratory statistics."""
    from eda import analyze
    from preprocessing import preprocess, validate_payload

    transactions, budgets = validate_payload(request)
    return analyze(preprocess(transactions, budgets))


def op_regression(request):
    """Run deterministic linear regression over cleaned monthly financial data."""
    from regression import regression_operation

    return regression_operation(request)


OPERATIONS = {
    "ping": op_ping,
    "env_check": op_env_check,
    "eda": op_eda,
    "regression": op_regression,
}


def handle(raw_input: str) -> dict:
    """Turn the raw stdin text into a response dict. Never raises."""
    try:
        if not raw_input.strip():
            raise AnalysisError("InvalidInput", "No input received on stdin")
        try:
            request = json.loads(raw_input)
        except json.JSONDecodeError as exc:
            raise AnalysisError("InvalidInput", f"Input is not valid JSON: {exc.msg}")
        if not isinstance(request, dict):
            raise AnalysisError("InvalidInput", "Input must be a JSON object")

        operation = request.get("operation")
        if not isinstance(operation, str) or not operation:
            raise AnalysisError("InvalidInput", "Missing 'operation' field")

        handler = OPERATIONS.get(operation)
        if handler is None:
            available = ", ".join(sorted(OPERATIONS))
            raise AnalysisError(
                "UnknownOperation", f"Unknown operation '{operation}'. Available: {available}"
            )

        # Divert stray print() output away from stdout so the JSON stays clean.
        with contextlib.redirect_stdout(sys.stderr):
            result = handler(request)
        return {"ok": True, "result": result}

    except AnalysisError as exc:
        return {"ok": False, "error": exc.code, "message": exc.message}
    except Exception as exc:  # last resort: never emit a traceback on stdout
        return {"ok": False, "error": "InternalError", "message": f"{type(exc).__name__}: {exc}"}


def main():
    response = handle(sys.stdin.read())
    try:
        # allow_nan=False: NaN/Infinity are not valid JSON and would break JSON.parse in Node.
        output = json.dumps(response, allow_nan=False)
    except (ValueError, TypeError) as exc:
        output = json.dumps(
            {"ok": False, "error": "InternalError", "message": f"Result is not JSON-serializable: {exc}"}
        )
    sys.stdout.write(output)
    sys.stdout.flush()


if __name__ == "__main__":
    main()
