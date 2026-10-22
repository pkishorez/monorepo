import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Effect } from 'effect';
import { afterEach, describe, expect, it } from 'vitest';
import { Folders } from './index.js';

/*
 * Folders over a made-up home: what a listing holds and hides, that
 * nothing leaves home, and how a new folder is made.
 */

const made: Array<string> = [];
afterEach(() => {
  for (const path of made.splice(0)) {
    chmodSync(path, 0o755);
    rmSync(path, { recursive: true, force: true });
  }
});
const temp = () => {
  const path = realpathSync(mkdtempSync(join(tmpdir(), 'ai-folders-')));
  made.push(path);
  return path;
};

/** A home holding `code/` with the given sub-folders, and a file. */
const homeWith = (names: ReadonlyArray<string> = []) => {
  const home = temp();
  mkdirSync(join(home, 'code'));
  for (const name of names) mkdirSync(join(home, 'code', name));
  writeFileSync(join(home, 'code', 'notes.txt'), '');
  return home;
};

const run = <A, E>(home: string, effect: Effect.Effect<A, E, Folders>) =>
  Effect.runPromise(effect.pipe(Effect.provide(Folders.layer({ home }))));

const list = (home: string, path: string, query?: string) =>
  run(
    home,
    Effect.flatMap(Folders, (folders) =>
      folders.list(query === undefined ? { path } : { path, query }),
    ),
  );

const failure = <A, E>(home: string, effect: Effect.Effect<A, E, Folders>) =>
  run(home, Effect.flip(effect));

const names = (listing: {
  readonly folders: ReadonlyArray<{ name: string }>;
}) => listing.folders.map((folder) => folder.name);

describe('listing a folder', () => {
  it('lists sub-folders name-sorted, hides hidden ones, and says where it is', async () => {
    const home = homeWith(['b2', 'B10', 'a', '.git']);
    const listing = await list(home, '~/code');
    expect(listing).toMatchObject({
      path: join(home, 'code'),
      parent: home,
      truncated: false,
    });
    expect(names(listing)).toEqual(['a', 'b2', 'B10']);
    expect((await list(home, '~')).parent).toBeNull();
    expect((await list(home, 'code')).path).toBe(join(home, 'code'));
  });

  it('filters by a query, and shows hidden folders only for one starting with a dot', async () => {
    const home = homeWith(['foo', 'Food', 'bar', '.config', '.foo']);
    expect(names(await list(home, '~/code', 'FO'))).toEqual(['foo', 'Food']);
    const hidden = await list(home, '~/code', '.');
    expect(hidden.folders).toEqual([
      { name: '.config', hidden: true, link: false },
      { name: '.foo', hidden: true, link: false },
    ]);
  });

  it('holds at most 100 folders, and says when it was cut short', async () => {
    const home = homeWith(
      Array.from({ length: 120 }, (_, at) => `f${String(at).padStart(3, '0')}`),
    );
    const listing = await list(home, '~/code');
    expect(listing.folders).toHaveLength(100);
    expect(listing.truncated).toBe(true);
    const asked = await list(home, '~/code', 'f11');
    expect(names(asked)).toEqual(
      Array.from({ length: 10 }, (_, at) => `f11${at}`),
    );
    expect(asked.truncated).toBe(false);
  });

  it('lists a symlink to a folder inside home as a link, and leaves out one leading outside', async () => {
    const home = homeWith(['real']);
    symlinkSync(join(home, 'code', 'real'), join(home, 'code', 'alias'));
    symlinkSync(temp(), join(home, 'code', 'away'));
    symlinkSync(join(home, 'code', 'notes.txt'), join(home, 'code', 'file'));
    expect((await list(home, '~/code')).folders).toEqual([
      { name: 'alias', hidden: false, link: true },
      { name: 'real', hidden: false, link: false },
    ]);
  });

  it('refuses anything outside home, even through a symlink', async () => {
    const home = homeWith();
    const away = temp();
    symlinkSync(away, join(home, 'away'));
    const outside = (path: string) =>
      failure(
        home,
        Effect.flatMap(Folders, (folders) => folders.list({ path })),
      );
    expect(await outside(away)).toMatchObject({ _tag: 'OutsideHome' });
    expect(await outside('~/..')).toMatchObject({ _tag: 'OutsideHome' });
    expect(await outside('~/away')).toMatchObject({
      _tag: 'OutsideHome',
      path: away,
    });
  });

  it('says when a folder is missing, is a file, or may not be read', async () => {
    const home = homeWith(['locked']);
    const fail = (path: string) =>
      failure(
        home,
        Effect.flatMap(Folders, (folders) => folders.list({ path })),
      );
    expect(await fail('~/nope')).toMatchObject({ _tag: 'FolderNotFound' });
    expect(await fail('~/code/notes.txt')).toMatchObject({
      _tag: 'FolderNotFound',
    });
    chmodSync(join(home, 'code', 'locked'), 0o000);
    expect(await fail('~/code/locked')).toMatchObject({
      _tag: 'PermissionDenied',
    });
    chmodSync(join(home, 'code', 'locked'), 0o755);
  });
});

describe('creating a folder', () => {
  const create = (home: string, parent: string, name: string) =>
    Effect.flatMap(Folders, (folders) => folders.create({ parent, name }));

  it('makes the folder and starts a git repository in it', async () => {
    const home = homeWith();
    const created = await run(home, create(home, '~/code', 'fresh'));
    expect(created).toEqual({
      path: join(home, 'code', 'fresh'),
      gitInitError: null,
    });
    expect(existsSync(join(home, 'code', 'fresh', '.git'))).toBe(true);
    expect(
      execFileSync('git', ['rev-parse', '--is-inside-work-tree'], {
        cwd: created.path,
      })
        .toString()
        .trim(),
    ).toBe('true');
  });

  it('refuses bad names, a folder already there, a missing parent and one outside home', async () => {
    const home = homeWith(['taken']);
    const fail = (parent: string, name: string) =>
      failure(home, create(home, parent, name));
    for (const name of ['', '..', 'a/b', ' padded', 'a\0b', 'x'.repeat(256)])
      expect(await fail('~/code', name)).toMatchObject({
        _tag: 'InvalidFolderName',
        name,
      });
    expect(await fail('~/code', 'taken')).toMatchObject({
      _tag: 'FolderExists',
    });
    expect(await fail('~/code', 'notes.txt')).toMatchObject({
      _tag: 'FolderExists',
    });
    // Never makes the parents.
    expect(await fail('~/code/new/deeper', 'x')).toMatchObject({
      _tag: 'FolderNotFound',
    });
    expect(existsSync(join(home, 'code', 'new'))).toBe(false);
    expect(await fail(temp(), 'x')).toMatchObject({ _tag: 'OutsideHome' });
  });

  it('says when it may not write the parent', async () => {
    const home = homeWith(['locked']);
    chmodSync(join(home, 'code', 'locked'), 0o555);
    expect(
      await failure(home, create(home, '~/code/locked', 'x')),
    ).toMatchObject({ _tag: 'PermissionDenied' });
    chmodSync(join(home, 'code', 'locked'), 0o755);
  });
});
