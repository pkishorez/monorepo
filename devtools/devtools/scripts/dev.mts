import { spawn } from 'node:child_process';

const server = spawn('pnpm', ['exec', 'tsx', 'src/server/main.ts'], {
  stdio: 'inherit',
  env: { ...process.env, DEVTOOLS_SKIP_UI_CHECK: '1' },
});
const browser = spawn('pnpm', ['exec', 'vp', 'dev'], {
  stdio: 'inherit',
});

const stop = () => {
  server.kill('SIGTERM');
  browser.kill('SIGTERM');
};

process.once('SIGINT', stop);
process.once('SIGTERM', stop);

const exitCode = await Promise.race([
  new Promise<number>((resolve) =>
    server.once('exit', (code) => resolve(code ?? 1)),
  ),
  new Promise<number>((resolve) =>
    browser.once('exit', (code) => resolve(code ?? 1)),
  ),
]);
stop();
process.exitCode = exitCode;
