import { fileURLToPath } from 'node:url';

import { Effect } from 'effect';
import { describe, expect, test } from 'vitest';

import { loadSourceFiles } from '../index.js';

const configPath = fileURLToPath(
  new URL(
    '../../../tests/fixtures/modules/valid/laymos.config.json',
    import.meta.url,
  ),
);

describe('loadSourceFiles', () => {
  test('reads every analyzed file below a Configured Module’s root', async () => {
    const result = await loadSourceFiles(configPath, ['src/shared']).pipe(
      Effect.runPromise,
    );

    expect(result.files.map(({ path }) => path)).toEqual([
      'src/shared/index.ts',
      'src/shared/public/index.ts',
    ]);
    expect(result.files[0]?.content).toContain('export');
  });

  test('reads under every given prefix, never duplicating an overlap', async () => {
    const result = await loadSourceFiles(configPath, [
      'src/feature',
      'src',
    ]).pipe(Effect.runPromise);

    expect(result.files.map(({ path }) => path)).toContain(
      'src/feature/index.ts',
    );
    expect(
      result.files.filter(({ path }) => path === 'src/feature/index.ts'),
    ).toHaveLength(1);
  });

  test('reads the whole Project for the root prefix', async () => {
    const result = await loadSourceFiles(configPath, ['.']).pipe(
      Effect.runPromise,
    );

    expect(result.files.map(({ path }) => path)).toEqual([
      'src/feature/index.ts',
      'src/shared/index.ts',
      'src/shared/public/index.ts',
    ]);
  });

  test('matches nothing for a prefix outside the analysis universe', async () => {
    const result = await loadSourceFiles(configPath, ['../../../../etc']).pipe(
      Effect.runPromise,
    );

    expect(result.files).toEqual([]);
  });
});
