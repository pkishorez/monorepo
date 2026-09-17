import { resolve } from 'node:path';

import { Effect } from 'effect';
import { describe, expect, test } from 'vitest';

import { analyzeMonorepo } from '../index.js';

describe('analyzeMonorepo', () => {
  test('rejects a relative Monorepo path', async () => {
    const error = await analyzeMonorepo('../..').pipe(
      Effect.flip,
      Effect.runPromise,
    );

    expect(error).toMatchObject({
      _tag: 'InvalidMonorepoPathError',
      reason: 'relative',
    });
  });

  test('reports a folder without pnpm-workspace.yaml as not a Monorepo', async () => {
    const error = await analyzeMonorepo(process.cwd()).pipe(
      Effect.flip,
      Effect.runPromise,
    );

    expect(error).toMatchObject({
      _tag: 'NotPnpmWorkspaceError',
      path: resolve(process.cwd(), 'pnpm-workspace.yaml'),
    });
  });

  test('returns a Monorepo analysis for the repository root', async () => {
    const analysis = await analyzeMonorepo(
      resolve(process.cwd(), '../..'),
    ).pipe(Effect.runPromise);

    expect(analysis.packages.length).toBeGreaterThan(0);
    expect(
      analysis.packages.some((pkg) => pkg.name === '@pkishorez/devtools'),
    ).toBe(true);
  });
});
