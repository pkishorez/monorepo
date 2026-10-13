import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

const cliPath = fileURLToPath(new URL('../../cli.ts', import.meta.url));

function fixture(name: string): string {
  return fileURLToPath(
    new URL(
      `../../../tests/fixtures/stories/${name}/laymos.config.json`,
      import.meta.url,
    ),
  );
}

/** Runs the CLI in its own process; resolves with its exit code, or null when it is still alive after the deadline. */
function runCli(args: readonly string[], deadline: number) {
  return new Promise<{ code: number | null; output: string }>((resolve) => {
    const child = spawn(process.execPath, [
      '--import',
      'tsx',
      cliPath,
      ...args,
    ]);
    let output = '';
    child.stdout.on('data', (chunk) => (output += chunk));
    const timer = setTimeout(() => {
      child.kill();
      resolve({ code: null, output });
    }, deadline);
    child.on('exit', (code) => {
      clearTimeout(timer);
      resolve({ code, output });
    });
  });
}

describe('laymos stories', () => {
  test('exits once it has reported, though a Proof left a timer running', async () => {
    const { code, output } = await runCli(
      ['--config', fixture('lingering'), 'stories'],
      15_000,
    );

    expect(code).toBe(0);
    expect(output).toContain('1 passed');
  }, 20_000);

  test('exits with 1 when a Proof does not pass', async () => {
    const { code } = await runCli(
      ['--config', fixture('verdicts'), 'stories', 'verdicts/failed'],
      15_000,
    );

    expect(code).toBe(1);
  }, 20_000);
});
