import { Effect, SubscriptionRef } from 'effect';
import { describe, expect, it } from 'vitest';
import { FileSystem } from '../../../../capabilities/index.js';
import {
  addFile,
  addFolder,
  addSampleProject,
  branchOfHead,
  type Disk,
  diskOf,
  type DiskChange,
  emptyHome,
  fileSystemOver,
  originOf,
  parseConfig,
} from '../index.js';

/*
 * The File System fake: what a person's changes make of an empty home,
 * and what the File System key answers over it, as node.ts would on a
 * disk like it. The key changes the disk only when something changes.
 */

const HOME = '/home/you';
const SHOP = `${HOME}/code/shop`;

/** A new fake computer, how often the key changed its disk, and its key. */
const computer = (refused?: string) => {
  const state = Effect.runSync(SubscriptionRef.make(emptyHome));
  const kept = diskOf(state);
  const changes = { count: 0 };
  const disk: Disk = {
    read: kept.read,
    update: (change) =>
      refused === undefined
        ? Effect.andThen(
            Effect.sync(() => void changes.count++),
            kept.update(change),
          )
        : Effect.fail(refused),
  };
  const layer = fileSystemOver(disk);
  const fs = <A, E>(use: (fs: FileSystem['Service']) => Effect.Effect<A, E>) =>
    Effect.runPromise(
      Effect.flatMap(FileSystem, use).pipe(Effect.provide(layer)),
    );
  const failure = <A, E>(
    use: (fs: FileSystem['Service']) => Effect.Effect<A, E>,
  ) =>
    Effect.runPromise(
      Effect.flip(Effect.flatMap(FileSystem, use)).pipe(Effect.provide(layer)),
    );
  const control = (change: DiskChange) =>
    Effect.runSync(SubscriptionRef.update(state, change));
  const text = (path: string) =>
    fs((each) => each.readFile(path)).then((bytes) =>
      new TextDecoder().decode(bytes),
    );
  return { changes, fs, failure, control, text };
};

const names = (entries: ReadonlyArray<{ readonly name: string }>) =>
  entries.map(({ name }) => name);

describe('a new computer', () => {
  it('has an empty home at /home/you', async () => {
    const { fs } = computer();
    expect(await fs((each) => Effect.succeed(each.home))).toBe(HOME);
    expect(await fs((each) => each.list(HOME))).toEqual([]);
    expect(await fs((each) => each.list('/home'))).toEqual([
      { name: 'you', kind: 'folder', hidden: false },
    ]);
  });
});

describe("a person's changes", () => {
  it('add a sample project: files, and a repository as git keeps it', async () => {
    const { fs, text, control } = computer();
    control(addSampleProject('~/code/shop'));
    expect(names(await fs((each) => each.list(SHOP)))).toEqual([
      '.git',
      '.gitignore',
      'README.md',
      'package.json',
      'src',
    ]);
    expect(branchOfHead(await text(`${SHOP}/.git/HEAD`))).toBe('main');
    expect(
      names(await fs((each) => each.list(`${SHOP}/.git/refs/heads`))),
    ).toEqual(['feature', 'fix', 'main']);
    expect(await text(`${SHOP}/.git/refs/heads/main`)).toMatch(
      /^[0-9a-f]{40}\n$/,
    );
    expect(parseConfig(await text(`${SHOP}/.git/config`))).toEqual({
      origin: originOf(SHOP),
      upstreams: {
        main: 'origin/main',
        'feature/sign-in': 'origin/feature/sign-in',
      },
    });
    expect(
      names(await fs((each) => each.list(`${SHOP}/.git/refs/remotes/origin`))),
    ).toEqual(['HEAD', 'feature', 'main', 'release']);
    expect(
      names(await fs((each) => each.list(`${originOf(SHOP)}/refs/heads`))),
    ).toEqual(['feature', 'main', 'release']);
  });

  it('add folders, hidden ones, and files', async () => {
    const { fs, text, control } = computer();
    control(addFolder('code/a/b'));
    control(addFolder('~/.config'));
    control(addFile('code/notes.txt', 'hello'));
    expect(await fs((each) => each.list(HOME))).toEqual([
      { name: '.config', kind: 'folder', hidden: true },
      { name: 'code', kind: 'folder', hidden: false },
    ]);
    expect(await fs((each) => each.stat(`${HOME}/code/a/b`))).toEqual({
      kind: 'folder',
    });
    expect(await text(`${HOME}/code/notes.txt`)).toBe('hello');
  });
});

describe('the File System key over the fake', () => {
  it('makes folders, changing the disk only for one new', async () => {
    const { fs, failure, changes } = computer();
    await fs((each) => each.mkdir(`${HOME}/new`));
    expect(await failure((each) => each.mkdir(`${HOME}/new`))).toMatchObject({
      _tag: 'AlreadyExists',
      path: `${HOME}/new`,
    });
    expect(await failure((each) => each.mkdir(`${HOME}/a/b`))).toMatchObject({
      _tag: 'NotFound',
    });
    await fs((each) => each.mkdir(`${HOME}/a/b`, { recursive: true }));
    await fs((each) => each.mkdir(`${HOME}/a/b`, { recursive: true }));
    expect(names(await fs((each) => each.list(`${HOME}/a`)))).toEqual(['b']);
    expect(changes.count).toBe(2);
  });

  it('reads and writes files, bytes or text', async () => {
    const { fs, failure, text, control } = computer();
    control(addFolder('code'));
    const path = `${HOME}/code/data.bin`;
    await fs((each) => each.writeFile(path, new Uint8Array([0, 255, 1])));
    expect(await fs((each) => each.readFile(path))).toEqual(
      new Uint8Array([0, 255, 1]),
    );
    await fs((each) => each.writeFile(path, 'héllo'));
    expect(await text(path)).toBe('héllo');
    expect(
      await failure((each) => each.writeFile(`${HOME}/no/x.txt`, '')),
    ).toMatchObject({ _tag: 'NotFound' });
    expect(
      await failure((each) => each.readFile(`${HOME}/code`)),
    ).toMatchObject({ _tag: 'IoError' });
    expect(
      await failure((each) => each.writeFile(`${HOME}/code`, '')),
    ).toMatchObject({ _tag: 'IoError' });
  });

  it('finds a path made normal, and stops at nothing there or a file on the way', async () => {
    const { fs, failure, control } = computer();
    control(addFile('code/notes.txt', 'hi'));
    expect(
      await fs((each) => each.realpath(`${HOME}/code/../code/./notes.txt`)),
    ).toBe(`${HOME}/code/notes.txt`);
    expect(await failure((each) => each.stat(`${HOME}/gone`))).toMatchObject({
      _tag: 'NotFound',
    });
    expect(
      await failure((each) => each.realpath(`${HOME}/code/notes.txt/x`)),
    ).toMatchObject({ _tag: 'NotFound' });
  });

  it('removes a file, and a folder only when recursive', async () => {
    const { fs, failure, control, changes } = computer();
    control(addFile('code/notes.txt', 'hi'));
    control(addFile('code/todo.txt', ''));
    await fs((each) => each.remove(`${HOME}/code/todo.txt`));
    expect(names(await fs((each) => each.list(`${HOME}/code`)))).toEqual([
      'notes.txt',
    ]);
    expect(await failure((each) => each.remove(`${HOME}/code`))).toMatchObject({
      _tag: 'IoError',
    });
    await fs((each) => each.remove(`${HOME}/code`, { recursive: true }));
    expect(await failure((each) => each.remove(`${HOME}/code`))).toMatchObject({
      _tag: 'NotFound',
    });
    await fs((each) => each.remove(`${HOME}/code`, { force: true }));
    expect(await fs((each) => each.list(HOME))).toEqual([]);
    expect(changes.count).toBe(2);
  });

  it('fails a change its keeper refuses, saying why', async () => {
    const { failure } = computer('The computer is gone');
    expect(await failure((each) => each.mkdir(`${HOME}/new`))).toMatchObject({
      _tag: 'IoError',
      message: 'The computer is gone',
    });
  });
});
