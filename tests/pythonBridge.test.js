const fs = require('fs');
const os = require('os');
const path = require('path');
const { runPython } = require('../backend/services/pythonBridge');
const AppError = require('../backend/utils/AppError');

// Throwaway Python scripts that misbehave in specific ways.
let dir;
const script = (name, body) => {
  const p = path.join(dir, name);
  fs.writeFileSync(p, body);
  return p;
};

beforeAll(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'artha-bridge-')); });
afterAll(() => { fs.rmSync(dir, { recursive: true, force: true }); });

describe('runPython with the real analysis.py', () => {
  test('ping round-trips JSON over stdin/stdout', async () => {
    const result = await runPython('ping');
    expect(result.message).toBe('pong');
    expect(result.python).toMatch(/^3\./);
  });

  test('env_check reports pandas and numpy', async () => {
    const result = await runPython('env_check');
    expect(result.pandas).toBeTruthy();
    expect(result.numpy).toBeTruthy();
  });

  test('eda operation preprocesses transaction payloads and returns statistical results', async () => {
    const result = await runPython('eda', {
      transactions: [
        { type: 'income', category: 'Salary', amount: 1000, date: '2026-01-05T00:00:00.000Z' },
        { type: 'expense', category: 'Food', amount: 200, date: '2026-01-06T00:00:00.000Z' },
      ],
      budgets: [],
    });
    expect(result.overview).toMatchObject({ totalIncome: 1000, totalExpenditure: 200, totalSavings: 800, transactionCount: 2 });
    expect(result.univariate.categorySpending[0]).toMatchObject({ category: 'Food', amount: 200 });
  });

  test('regression operation returns historical trend summaries through the JSON bridge', async () => {
    const transactions = [];
    [10000, 12000, 14000].forEach((amount, index) => {
      const month = `2026-0${index + 1}`;
      transactions.push({ type: 'income', category: 'Salary', amount: 30000 + index * 5000, date: `${month}-05T00:00:00.000Z` });
      transactions.push({ type: 'expense', category: 'Food', amount, date: `${month}-10T00:00:00.000Z` });
    });
    const result = await runPython('regression', { transactions, asOf: '2026-03-15' });
    expect(result.expenditureTrend).toMatchObject({ status: 'ok', trend: 'increasing', coefficient: 2000, monthsAnalyzed: 3 });
    expect(result.incomeSavings.relationship).toBe('positive');
  });

  test('unknown operation -> AppError 500 with a generic message', async () => {
    await expect(runPython('make_coffee')).rejects.toMatchObject({
      statusCode: 500,
      message: 'Analysis could not be completed',
    });
  });

  test('payload fields are delivered to Python (JSON, not a shell string)', async () => {
    // A shell metacharacter in the payload must be inert.
    const s = script('echo.py', `
import sys, json
req = json.load(sys.stdin)
sys.stdout.write(json.dumps({"ok": True, "result": {"got": req}}))
`);
    const result = await runPython('echo', { note: '"; rm -rf / #', n: 3 }, { script: s });
    expect(result.got).toEqual({ operation: 'echo', note: '"; rm -rf / #', n: 3 });
  });
});

describe('runPython failure handling (Node must never crash)', () => {
  test('InsufficientData -> 422 with Python\'s message', async () => {
    const s = script('insufficient.py', `
import sys, json
sys.stdin.read()
sys.stdout.write(json.dumps({"ok": False, "error": "InsufficientData", "message": "At least 6 months required"}))
`);
    const err = await runPython('regression', {}, { script: s }).catch((e) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(422);
    expect(err.message).toBe('At least 6 months required');
  });

  test('script that crashes (non-zero exit) -> 500, traceback not exposed', async () => {
    const s = script('crash.py', `
import sys
sys.stdin.read()
raise RuntimeError("secret traceback detail")
`);
    const err = await runPython('x', {}, { script: s }).catch((e) => e);
    expect(err.statusCode).toBe(500);
    expect(err.message).toBe('Analysis failed unexpectedly');
    expect(err.message).not.toContain('secret');
  });

  test('stdout that is not JSON -> 500', async () => {
    const s = script('garbage.py', `
import sys
sys.stdin.read()
sys.stdout.write("hello, I am not JSON")
`);
    const err = await runPython('x', {}, { script: s }).catch((e) => e);
    expect(err.statusCode).toBe(500);
    expect(err.message).toBe('Analysis returned an unreadable response');
  });

  test('JSON without an "ok" field -> 500', async () => {
    const s = script('noflag.py', `
import sys
sys.stdin.read()
sys.stdout.write('{"result": 1}')
`);
    const err = await runPython('x', {}, { script: s }).catch((e) => e);
    expect(err.statusCode).toBe(500);
    expect(err.message).toBe('Analysis returned an unexpected response');
  });

  test('slow script is killed at the timeout -> 500', async () => {
    const s = script('slow.py', `
import sys, time
sys.stdin.read()
time.sleep(30)
`);
    const started = Date.now();
    const err = await runPython('x', {}, { script: s, timeoutMs: 400 }).catch((e) => e);
    expect(err.statusCode).toBe(500);
    expect(err.message).toBe('Analysis took too long and was cancelled');
    expect(Date.now() - started).toBeLessThan(5000);
  });

  test('output larger than maxBuffer -> 500', async () => {
    const s = script('big.py', `
import sys, json
sys.stdin.read()
sys.stdout.write(json.dumps({"ok": True, "result": "x" * 5000}))
`);
    const err = await runPython('x', {}, { script: s, maxBuffer: 1000 }).catch((e) => e);
    expect(err.statusCode).toBe(500);
    expect(err.message).toBe('Analysis produced too much output');
  });

  test('missing Python executable -> 500, no crash', async () => {
    const err = await runPython('ping', {}, { bin: 'definitely-not-a-python-binary' }).catch((e) => e);
    expect(err.statusCode).toBe(500);
    expect(err.message).toBe('Analysis engine is not available on the server');
  });

  test('missing script file -> 500, no crash', async () => {
    const err = await runPython('ping', {}, { script: path.join(dir, 'nope.py') }).catch((e) => e);
    expect(err.statusCode).toBe(500);
  });
});
