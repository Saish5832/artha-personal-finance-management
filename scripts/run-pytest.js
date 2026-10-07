/**
 * Cross-platform pytest launcher (used by `npm run test:py`).
 * Picks the Python executable exactly like the app does: PYTHON_BIN from .env/environment,
 * otherwise "python" on Windows and "python3" on macOS/Linux.
 */
const path = require('path');
const { spawnSync } = require('child_process');
const { config } = require('../backend/config/env');

const root = path.join(__dirname, '..');
const args = ['-m', 'pytest', 'python-analysis/tests', '-v', ...process.argv.slice(2)];
const result = spawnSync(config.python.bin, args, { cwd: root, stdio: 'inherit' });

if (result.error) {
  console.error(`Could not run "${config.python.bin}": ${result.error.message}`);
  console.error('Install Python 3.10+ and pytest (pip install -r python-analysis/requirements.txt), or set PYTHON_BIN in .env.');
  process.exit(1);
}
process.exit(result.status === null ? 1 : result.status);
