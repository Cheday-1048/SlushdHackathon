import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const localPython = join(root, '.venv', process.platform === 'win32' ? 'Scripts' : 'bin', process.platform === 'win32' ? 'python.exe' : 'python');
const python = process.env.RDL_PYTHON || (existsSync(localPython) ? localPython : process.platform === 'win32' ? 'python' : 'python3');
const child = spawn(python, ['-m', 'uvicorn', 'app.main:app', '--app-dir', resolve(root, 'backend'), '--host', '127.0.0.1', '--port', '8000', ...process.argv.slice(2)], { cwd: root, stdio: 'inherit' });
child.on('error', (error) => { console.error(`Cannot start backend: ${error.message}`); process.exit(1); });
child.on('exit', (code) => { process.exit(code ?? 1); });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
