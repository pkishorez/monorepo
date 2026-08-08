import { resolve } from 'node:path';

import { Effect } from 'effect';
import { describe, expect, test } from 'vitest';

import { getLaymosModuleSource } from '../index.js';

const projectPath = resolve(
  process.cwd(),
  '../laymos/src/tests/fixtures/modules/valid',
);

describe('getLaymosModuleSource', () => {
  test('returns a Module source snapshot', async () => {
    const snapshot = await getLaymosModuleSource(
      projectPath,
      'src/shared',
    ).pipe(Effect.runPromise);

    expect(snapshot.modulePath).toBe('src/shared');
    expect(snapshot.files.map(({ path }) => path)).toEqual([
      'src/shared/index.ts',
      'src/shared/public/index.ts',
    ]);
  });

  test('reports an unknown Configured Module', async () => {
    const error = await getLaymosModuleSource(projectPath, 'src/unknown').pipe(
      Effect.flip,
      Effect.runPromise,
    );

    expect(error).toMatchObject({
      _tag: 'ModuleSourceNotFoundError',
      modulePath: 'src/unknown',
    });
  });
});
