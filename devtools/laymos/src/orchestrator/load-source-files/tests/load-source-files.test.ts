import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Effect } from 'effect';
import { describe, expect, test } from 'vitest';

import type { ModuleSourceFile } from '../../../architecture-analysis-schema/index.js';
import { loadFolderFiles, loadSourceFiles } from '../index.js';

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

    expect(analyzed(result.files)).toEqual([
      'src/shared/index.ts',
      'src/shared/public/index.ts',
    ]);
    expect(result.files[0]?.content).toContain('export');
  });

  test('marks files git knows outside the analysis universe as unanalyzed', async () => {
    const result = await loadSourceFiles(configPath, ['src/shared']).pipe(
      Effect.runPromise,
    );

    expect(unanalyzed(result.files)).toEqual([
      'src/shared/generated.ts',
      'src/shared/notes.md',
      'src/shared/README.md',
    ]);
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

    expect(analyzed(result.files)).toEqual([
      'src/feature/index.ts',
      'src/shared/index.ts',
      'src/shared/public/index.ts',
    ]);
    expect(unanalyzed(result.files)).toContain('laymos.config.json');
  });

  test('matches nothing for a prefix outside the analysis universe', async () => {
    const result = await loadSourceFiles(configPath, ['../../../../etc']).pipe(
      Effect.runPromise,
    );

    expect(result.files).toEqual([]);
  });
});

describe('loadFolderFiles', () => {
  test('reads every file git knows below the given paths of a folder', async () => {
    const folder = dirname(configPath);
    const result = await loadFolderFiles(folder, ['docs']).pipe(
      Effect.runPromise,
    );

    expect(result.files.map(({ path }) => path)).toEqual([
      'docs/app.md',
      'docs/architecture.md',
    ]);
    expect(unanalyzed(result.files)).toEqual([]);
  });

  test('matches nothing for a path outside the folder', async () => {
    const result = await loadFolderFiles(dirname(configPath), [
      '../../../../etc',
    ]).pipe(Effect.runPromise);

    expect(result.files).toEqual([]);
  });
});

function analyzed(files: readonly ModuleSourceFile[]): string[] {
  return files.filter((file) => !file.unanalyzed).map(({ path }) => path);
}

function unanalyzed(files: readonly ModuleSourceFile[]): string[] {
  return files.filter((file) => file.unanalyzed).map(({ path }) => path);
}
