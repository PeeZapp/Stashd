import { spawn } from 'child_process';

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const children = [
  spawn(npmCmd, ['run', 'proxy'], {
    stdio: 'inherit',
    shell: false,
  }),
  spawn(npmCmd, ['run', 'dev:vite'], {
    stdio: 'inherit',
    shell: false,
  }),
];

let shuttingDown = false;

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill();
  }
  process.exit(code);
}

for (const child of children) {
  child.on('exit', (code, signal) => {
    if (!shuttingDown && code !== 0) {
      console.error(`Dev child exited with ${signal ?? code}`);
      shutdown(code ?? 1);
    }
  });
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
