import { execFileSync } from 'node:child_process';

import { isSource } from '@kestack/monoverse';
import { Effect, Fiber } from 'effect';
import { describe, expect, test } from 'vitest';

import { runEngine, runningEngines } from '../real/engine.js';

const root = execFileSync('git', ['rev-parse', '--show-toplevel'], {
  encoding: 'utf8',
}).trim();
const files = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
  .split('\n')
  .filter(Boolean);
const job = { root, files, packages: [], imports: files.filter(isSource) };

const until = async (done: () => boolean) => {
  for (let tries = 0; tries < 500 && !done(); tries++)
    await new Promise((resolve) => setTimeout(resolve, 10));
};

describe('the engine in a worker thread', () => {
  test('answers plain data', async () => {
    const answer = await Effect.runPromise(
      runEngine({
        root,
        files,
        packages: ['devtools/devtools'],
        imports: ['devtools/devtools/src/cli/main.ts'],
      }),
    );
    expect(answer.reports.map(({ path }) => path)).toEqual([
      'devtools/devtools',
    ]);
    expect(answer.imports[0]?.[0]).toBe('devtools/devtools/src/cli/main.ts');
  });

  test('runs three at once, and stops the worker of a request given up', async () => {
    const fibers = Array.from({ length: 5 }, () =>
      Effect.runFork(runEngine(job)),
    );
    await until(() => runningEngines() === 3);
    expect(runningEngines()).toBe(3);
    const given = performance.now();
    await Effect.runPromise(Fiber.interruptAll(fibers));
    await until(() => runningEngines() === 0);
    expect(runningEngines()).toBe(0);
    expect(performance.now() - given).toBeLessThan(600);
  }, 20_000);
});
