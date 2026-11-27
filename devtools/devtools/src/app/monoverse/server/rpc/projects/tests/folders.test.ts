import {
  mkdir,
  mkdtemp,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Effect } from 'effect';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { listFolders } from '../real/folders.js';

let home: string;
let outside: string;

beforeEach(async () => {
  home = await realpath(await mkdtemp(join(tmpdir(), 'monoverse-home-')));
  outside = await realpath(await mkdtemp(join(tmpdir(), 'monoverse-out-')));
  const folders: Record<string, Record<string, string>> = {
    code: {},
    'code/mono': { 'pnpm-workspace.yaml': 'packages: []\n' },
    'code/yarn-mono': { 'package.json': '{"workspaces":["apps/*"]}' },
    'code/solo': { 'package.json': '{"name":"solo"}' },
    'code/notes': {},
    'code/.hidden': {},
    'code/Item10': {},
    'code/Item9': {},
  };
  for (const [folder, files] of Object.entries(folders)) {
    await mkdir(join(home, folder), { recursive: true });
    for (const [name, text] of Object.entries(files))
      await writeFile(join(home, folder, name), text);
  }
  await writeFile(join(home, 'code/file.txt'), 'not a folder\n');
  await symlink(outside, join(home, 'code/linked'));
  await symlink(join(home, 'code/file.txt'), join(home, 'code/file-link'));
});
afterEach(async () => {
  await rm(home, { recursive: true, force: true });
  await rm(outside, { recursive: true, force: true });
});

const list = (path: string | null, query = '', hidden = false) =>
  Effect.runPromise(listFolders(home, { path, query, hidden }));

describe('listing folders under home', () => {
  test('null lists home, which has no parent', async () => {
    const listing = await list(null);
    expect(listing).toMatchObject({
      path: home,
      home,
      parent: null,
      kind: null,
      truncated: false,
    });
    expect(listing.folders.map(({ name }) => name)).toEqual(['code']);
  });

  test('lists sub-folders by name, links to folders marked, hidden ones and files left out', async () => {
    const listing = await list(join(home, 'code'));
    expect(listing.parent).toBe(home);
    expect(listing.folders).toEqual([
      {
        name: 'Item9',
        path: join(home, 'code/Item9'),
        link: false,
        kind: null,
      },
      {
        name: 'Item10',
        path: join(home, 'code/Item10'),
        link: false,
        kind: null,
      },
      {
        name: 'linked',
        path: join(home, 'code/linked'),
        link: true,
        kind: null,
      },
      {
        name: 'mono',
        path: join(home, 'code/mono'),
        link: false,
        kind: 'monorepo',
      },
      {
        name: 'notes',
        path: join(home, 'code/notes'),
        link: false,
        kind: null,
      },
      {
        name: 'solo',
        path: join(home, 'code/solo'),
        link: false,
        kind: 'package',
      },
      {
        name: 'yarn-mono',
        path: join(home, 'code/yarn-mono'),
        link: false,
        kind: 'monorepo',
      },
    ]);
  });

  test('says what the listed folder itself would open as', async () => {
    expect((await list(join(home, 'code/solo'))).kind).toBe('package');
    expect((await list('~/code/mono')).kind).toBe('monorepo');
  });

  test('keeps names holding the query, any case, and hidden ones only when asked', async () => {
    expect(
      (await list('~/code', 'MON')).folders.map(({ name }) => name),
    ).toEqual(['mono', 'yarn-mono']);
    expect((await list('code', 'hid')).folders).toEqual([]);
    expect(
      (await list('code', 'hid', true)).folders.map(({ name }) => name),
    ).toEqual(['.hidden']);
  });

  test('lists at most 100, and says when there were more', async () => {
    for (let index = 0; index < 105; index += 1)
      await mkdir(join(home, 'code/notes', `n${index}`));
    const listing = await list('~/code/notes');
    expect(listing.folders).toHaveLength(100);
    expect(listing.truncated).toBe(true);
  });

  test('refuses a folder outside home, one missing, and a file', async () => {
    const fail = (path: string) =>
      Effect.runPromise(
        listFolders(home, { path, query: '', hidden: false }).pipe(Effect.flip),
      );
    expect(await fail(outside)).toMatchObject({
      _tag: 'FolderError',
      reason: 'outside-home',
    });
    expect(await fail(join(home, '..'))).toMatchObject({
      reason: 'outside-home',
    });
    expect(await fail('~/missing')).toMatchObject({ reason: 'not-found' });
    expect(await fail('~/code/file.txt')).toMatchObject({
      reason: 'not-directory',
    });
  });
});
