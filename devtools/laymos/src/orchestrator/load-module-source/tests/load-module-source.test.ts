import { fileURLToPath } from 'node:url';

import { Effect } from 'effect';
import { describe, expect, test } from 'vitest';

import { loadModuleSource } from '../index.js';

const configPath = fileURLToPath(
  new URL(
    '../../../tests/fixtures/modules/valid/laymos.config.json',
    import.meta.url,
  ),
);
const laymosConfigPath = fileURLToPath(
  new URL('../../../../laymos.config.json', import.meta.url),
);

describe('loadModuleSource', () => {
  test('returns only analyzed files assigned to the Configured Module', async () => {
    const snapshot = await loadModuleSource(configPath, 'src/shared').pipe(
      Effect.runPromise,
    );

    expect(snapshot.modulePath).toBe('src/shared');
    expect(snapshot.entryPoint).toBe('src/shared/index.ts');
    expect(snapshot.files.map(({ path }) => path)).toEqual([
      'src/shared/index.ts',
      'src/shared/public/index.ts',
    ]);
    expect(snapshot.files[0]?.content).toContain('export const shared');
  });

  test('rejects a path that is not a Configured Module', async () => {
    const error = await loadModuleSource(configPath, 'src/shared/public').pipe(
      Effect.flip,
      Effect.runPromise,
    );

    expect(error).toMatchObject({
      _tag: 'ModuleSourceNotFound',
      modulePath: 'src/shared/public',
    });
  });

  test('loads an Entry File Module without a public entry point', async () => {
    const snapshot = await loadModuleSource(
      laymosConfigPath,
      'src/index.ts',
    ).pipe(Effect.runPromise);

    expect(snapshot.entryPoint).toBeUndefined();
    expect(snapshot.files.map(({ path }) => path)).toEqual(['src/index.ts']);
  });
});
