import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Effect } from 'effect';
import { afterEach, describe, expect, it } from 'vitest';

import { discoverTests, runTests } from '../src/entrypoints/node/index.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  delete (
    globalThis as typeof globalThis & {
      __laymosTestExecutions?: number;
    }
  ).__laymosTestExecutions;
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('Laymos Test runner', () => {
  it('discovers Test metadata without executing cases', async () => {
    const projectDir = await makeProject();
    await writeTest(
      projectDir,
      'addition',
      `import { test } from 'laymos/test';
globalThis.__laymosTestExecutions = 0;
test('Add numbers', { description: 'Checks addition across numeric inputs.' })
  .execute((left: number, right: number) => {
    globalThis.__laymosTestExecutions += 1;
    return left + right;
  })
  .cases([{
    kind: 'positive',
    name: 'positive numbers',
    description: 'Adds two positive numeric inputs.',
    inputs: [2, 3],
    expected: 5,
  }]);`,
    );

    const catalog = await Effect.runPromise(discoverTests({ projectDir }));

    expect(catalog.modules).toHaveLength(1);
    expect(catalog.modules[0]?.tests[0]).toMatchObject({
      testPath: 'laymos/addition',
      testKey: 'addition',
      modulePath: '.',
      name: 'Add numbers',
    });
    expect(
      (
        globalThis as typeof globalThis & {
          __laymosTestExecutions?: number;
        }
      ).__laymosTestExecutions,
    ).toBe(0);
  });

  it('reports primitive values and named errors without storing an outcome', async () => {
    const projectDir = await makeProject();
    await writeTest(
      projectDir,
      'normalize',
      `import { error, test } from 'laymos/test';
test('Normalize input', { description: 'Checks normalization values and errors.' })
  .execute((value: string) => {
    if (value === 'invalid') throw new TypeError('Invalid input');
    return value.trim();
  })
  .cases([
    {
      kind: 'positive',
      name: 'trims text',
      description: 'Removes surrounding whitespace.',
      inputs: ['  ready  '],
      expected: 'ready',
    },
    {
      kind: 'negative',
      name: 'preserves a mismatch',
      description: 'Reports different expected and actual text.',
      inputs: ['actual'],
      expected: 'expected',
    },
    {
      kind: 'negative',
      name: 'captures a named error',
      description: 'Captures the thrown error by name.',
      inputs: ['invalid'],
      expected: error('TypeError'),
    },
  ]);`,
    );

    const report = await Effect.runPromise(runTests({ projectDir }));
    const cases = report.tests['laymos/normalize']?.cases;

    expect(cases).toEqual([
      {
        kind: 'positive',
        name: 'trims text',
        description: 'Removes surrounding whitespace.',
        inputs: ['  ready  '],
        expected: { kind: 'value', value: 'ready' },
        actual: { kind: 'value', value: 'ready' },
      },
      {
        kind: 'negative',
        name: 'preserves a mismatch',
        description: 'Reports different expected and actual text.',
        inputs: ['actual'],
        expected: { kind: 'value', value: 'expected' },
        actual: { kind: 'value', value: 'actual' },
      },
      {
        kind: 'negative',
        name: 'captures a named error',
        description: 'Captures the thrown error by name.',
        inputs: ['invalid'],
        expected: { kind: 'error', name: 'TypeError' },
        actual: { kind: 'error', name: 'TypeError' },
      },
    ]);
    expect(cases?.[0]).not.toHaveProperty('outcome');
  });

  it('normalizes Promise results and typed Effect errors', async () => {
    const projectDir = await makeProject();
    await writeTest(
      projectDir,
      'promise-value',
      `import { test } from 'laymos/test';
test('Resolve a Promise', { description: 'Checks asynchronous Test execution.' })
  .execute(async (value: boolean) => value)
  .cases([{
    kind: 'positive',
    name: 'true',
    description: 'Resolves a true value through a Promise.',
    inputs: [true],
    expected: true,
  }]);`,
    );
    await writeTest(
      projectDir,
      'effect-error',
      `import { Data, Effect } from 'effect';
import { error, test } from 'laymos/test';
class MissingValue extends Data.TaggedError('MissingValue')<{}> {}
test('Fail an Effect', { description: 'Checks typed Effect error reporting.' })
  .execute((value: string) => Effect.fail(new MissingValue()))
  .cases([{
    kind: 'negative',
    name: 'missing',
    description: 'Reports the typed missing-value error.',
    inputs: ['missing'],
    expected: error('MissingValue'),
  }]);`,
    );

    const report = await Effect.runPromise(runTests({ projectDir }));

    expect(report.tests['laymos/promise-value']?.cases[0]?.actual).toEqual({
      kind: 'value',
      value: true,
    });
    expect(report.tests['laymos/effect-error']?.cases[0]?.actual).toEqual({
      kind: 'error',
      name: 'MissingValue',
    });
  });

  it('reports Promise timeouts by their expected error name', async () => {
    const projectDir = await makeProject();
    await writeTest(
      projectDir,
      'promise-timeout',
      `import { error, test } from 'laymos/test';
test('Timeout a Promise', { description: 'Checks Promise timeout evidence.' })
  .execute(() => new Promise(() => {}))
  .cases([{
    kind: 'negative',
    name: 'times out',
    description: 'Reports the configured timeout by name.',
    inputs: [],
    expected: error('TestTimeoutError'),
  }]);`,
    );

    const report = await Effect.runPromise(
      runTests({ projectDir, timeout: '10 millis' }),
    );

    expect(report.tests['laymos/promise-timeout']?.cases[0]).toMatchObject({
      expected: { kind: 'error', name: 'TestTimeoutError' },
      actual: { kind: 'error', name: 'TestTimeoutError' },
    });
  });
});

async function makeProject(): Promise<string> {
  const projectDir = await mkdtemp(join(import.meta.dirname, 'tmp-tests-'));
  temporaryDirectories.push(projectDir);
  await writeFile(
    join(projectDir, 'laymos.config.ts'),
    `const app = {
  kind: 'layer',
  name: 'app',
  paths: ['.'],
  description: 'Application',
};
export default {
  sourceRoots: ['.'],
  graphs: [{
    kind: 'layer-graph',
    name: 'application',
    description: 'Application architecture',
    layers: [app],
    edges: [],
  }],
  modules: [{
    kind: 'module',
    path: '.',
    description: 'Application module',
  }],
};`,
  );
  await mkdir(join(projectDir, 'laymos'));
  return projectDir;
}

async function writeTest(
  projectDir: string,
  name: string,
  source: string,
): Promise<void> {
  await writeFile(join(projectDir, 'laymos', `${name}.test.ts`), source);
}
