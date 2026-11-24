import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Effect } from 'effect';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { openSnapshot } from '../../../tests/services.js';
import { readSourceRoots } from '../real/config/config.js';

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'monoverse-config-'));
  await mkdir(join(root, 'packages/core'), { recursive: true });
});
afterEach(() => rm(root, { recursive: true, force: true }));

const roots = (path: string) =>
  Effect.runPromise(
    Effect.flatMap(openSnapshot(root, null), (snapshot) =>
      readSourceRoots(snapshot, path),
    ),
  );
const config = (path: string, text: string) =>
  writeFile(join(root, path, 'laymos.config.json'), text);

describe('Source roots', () => {
  test('are the whole Package without a laymos.config.json', async () => {
    expect(await roots('packages/core')).toEqual(['packages/core']);
    expect(await roots('.')).toEqual(['']);
  });

  test('are its sourceRoots, relative to the root, and nothing else is read', async () => {
    await config(
      'packages/core',
      '{"sourceRoots":["src", "./scripts/"],"rules":{"src":["x"]}}',
    );
    expect(await roots('packages/core')).toEqual([
      'packages/core/src',
      'packages/core/scripts',
    ]);
  });

  test('never leave the Package, and fall back to all of it when unusable', async () => {
    await config('packages/core', '{"sourceRoots":["../other"]}');
    expect(await roots('packages/core')).toEqual(['packages/core']);
    await config('packages/core', '{ not json');
    expect(await roots('packages/core')).toEqual(['packages/core']);
  });

  test('of a Single Package are relative to its root', async () => {
    await config('.', '{"sourceRoots":["src"]}');
    expect(await roots('.')).toEqual(['src']);
  });
});
