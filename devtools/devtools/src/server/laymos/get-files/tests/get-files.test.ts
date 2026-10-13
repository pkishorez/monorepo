import { resolve } from 'node:path';

import { Effect } from 'effect';
import { describe, expect, test } from 'vitest';

import { getLaymosFile, getLaymosFileList } from '../index.js';

const projectPath = resolve(
  process.cwd(),
  '../laymos/src/tests/fixtures/tree/shop',
);

describe('getLaymosFileList', () => {
  test('lists the files of a Module with its Index', async () => {
    const list = await getLaymosFileList(projectPath, 'src/domain/orders').pipe(
      Effect.runPromise,
    );

    expect(list.modulePath).toBe('src/domain/orders');
    expect(list.index).toBe('src/domain/orders/index.ts');
    expect(list.files).toContainEqual({
      path: 'src/domain/orders/index.ts',
      analyzed: true,
    });
    expect(list.files).toContainEqual({
      path: 'src/domain/orders/generated.ts',
      analyzed: false,
    });
  });

  test('reports an unknown Module', async () => {
    const error = await getLaymosFileList(projectPath, 'src/unknown').pipe(
      Effect.flip,
      Effect.runPromise,
    );

    expect(error).toMatchObject({
      _tag: 'FileNotFoundError',
      path: 'src/unknown',
    });
  });

  test('rejects a relative Project path', async () => {
    const error = await getLaymosFileList('../laymos', 'src').pipe(
      Effect.flip,
      Effect.runPromise,
    );

    expect(error).toMatchObject({
      _tag: 'InvalidProjectPath',
      reason: 'relative',
    });
  });
});

describe('getLaymosFile', () => {
  test('reads one file of the Project', async () => {
    const file = await getLaymosFile(
      projectPath,
      'src/domain/orders/index.ts',
    ).pipe(Effect.runPromise);

    expect(file.path).toBe('src/domain/orders/index.ts');
    expect(file.content.length).toBeGreaterThan(0);
    expect(file.binary).toBeUndefined();
  });

  test('reports a file outside the Project as not found', async () => {
    const error = await getLaymosFile(
      projectPath,
      '../loop/laymos.config.json',
    ).pipe(Effect.flip, Effect.runPromise);

    expect(error).toMatchObject({
      _tag: 'FileNotFoundError',
      path: '../loop/laymos.config.json',
    });
  });
});
