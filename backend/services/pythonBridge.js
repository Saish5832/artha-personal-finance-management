/**
 * Python bridge: Node.js invokes python-analysis/analysis.py as a child process.
 *
 *   Node  --JSON on stdin-->  analysis.py  --JSON on stdout-->  Node
 *
 * Python is a module called like a function, NOT a server. execFile (no shell)
 * is used so request data can never be interpreted as a shell command; data
 * travels only over stdin. Any Python failure is converted into an AppError so
 * it can never crash the Node process.
 *
 * Wire contract (see python-analysis/analysis.py):
 *   request : { "operation": "<name>", ...payload }
 *   success : { "ok": true,  "result": {...} }
 *   failure : { "ok": false, "error": "<Code>", "message": "..." }
 */
const { execFile } = require('child_process');
const { config } = require('../config/env');
const AppError = require('../utils/AppError');

const DEFAULT_MAX_BUFFER = 5 * 1024 * 1024; // 5 MB of JSON output

function logFailure(message, detail) {
  if (!config.isTest) console.error(`[python] ${message}`, detail || '');
}

/**
 * @param {string} operation       operation name understood by analysis.py
 * @param {object} [payload]       extra JSON fields (transactions, budgets, options...)
 * @param {object} [opts]          overrides, mainly for tests: bin, script, timeoutMs, maxBuffer
 * @returns {Promise<object>}      the "result" object from Python
 */
function runPython(operation, payload = {}, opts = {}) {
  const bin = opts.bin || config.python.bin;
  const script = opts.script || config.python.scriptPath;
  const timeout = opts.timeoutMs || config.python.timeoutMs;
  const maxBuffer = opts.maxBuffer || DEFAULT_MAX_BUFFER;

  return new Promise((resolve, reject) => {
    const child = execFile(
      bin,
      [script],
      { timeout, maxBuffer, encoding: 'utf8', windowsHide: true },
      (err, stdout, stderr) => {
        if (err) {
          if (err.code === 'ENOENT') {
            logFailure(`Python executable "${bin}" not found`);
            return reject(AppError.internal('Analysis engine is not available on the server', {
              cause: `Python executable "${bin}" not found. Set PYTHON_BIN in .env.`,
            }));
          }
          if (err.killed) {
            logFailure(`Timed out after ${timeout} ms`);
            return reject(AppError.internal('Analysis took too long and was cancelled', {
              cause: `Python timed out after ${timeout} ms`,
            }));
          }
          if (err.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
            return reject(AppError.internal('Analysis produced too much output', { cause: err }));
          }
          // Non-zero exit = the script crashed before it could write a JSON reply.
          logFailure(`Exited with code ${err.code}`, (stderr || '').slice(0, 500));
          return reject(AppError.internal('Analysis failed unexpectedly', {
            cause: `exit code ${err.code}: ${(stderr || '').slice(0, 500)}`,
          }));
        }

        let reply;
        try {
          reply = JSON.parse(stdout);
        } catch (parseErr) {
          logFailure('stdout was not valid JSON', stdout.slice(0, 200));
          return reject(AppError.internal('Analysis returned an unreadable response', { cause: parseErr }));
        }

        if (!reply || typeof reply.ok !== 'boolean') {
          return reject(AppError.internal('Analysis returned an unexpected response', { cause: reply }));
        }

        if (reply.ok) return resolve(reply.result);

        // Python reported a handled error. "InsufficientData" is a normal, user-facing
        // outcome (not enough history) -> 422 with Python's message. Everything else is a 500.
        if (reply.error === 'InsufficientData') {
          return reject(AppError.unprocessable(reply.message || 'Not enough data for this analysis'));
        }
        logFailure(`${reply.error}: ${reply.message}`);
        return reject(AppError.internal('Analysis could not be completed', {
          cause: `${reply.error}: ${reply.message}`,
        }));
      }
    );

    // If the process dies before reading stdin, writing raises EPIPE; the execFile
    // callback above already reports the real failure, so ignore the stream error.
    child.stdin.on('error', () => {});
    child.stdin.end(JSON.stringify({ ...payload, operation }));
  });
}

module.exports = { runPython };
