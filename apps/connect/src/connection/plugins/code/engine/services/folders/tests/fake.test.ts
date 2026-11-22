import { Effect, Fiber, Layer } from 'effect';
import { TestClock } from 'effect/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { Runtime } from '@kestack/kabuki';
import { FileSystem, Folders } from '../../../capabilities/index.js';
import {
  fileSystem,
  HOME,
  type FileSystemMessage,
} from '../../file-system/fake/index.js';
import { homeFolders } from '../index.js';

/*
 * Folders over the File System fake, as a browser tab runs them: the same
 * listings and refusals as on a disk, the world made by the fake's
 * Controls, and a new folder made as a Message to it.
 */

const CODE = `${HOME}/code`;

const opened: Array<Runtime<typeof fileSystem.actor>> = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((runtime) => runtime.dispose()));
});

/** A blank fake computer with `~/code` and a file in it, and Folders over it. */
const computer = () => {
  const runtime = Runtime.make(fileSystem.actor);
  opened.push(runtime);
  const control = (message: FileSystemMessage) =>
    expect(runtime.root.send(message)).toBe('handled');
  control({ _tag: 'AddFolder', folder: '~/code' });
  control({ _tag: 'AddFile', file: '~/code/notes.txt', text: '' });
  const layer = homeFolders.pipe(Layer.provide(fileSystem.serve(runtime)));
  const run = <A, E>(effect: Effect.Effect<A, E, Folders>) =>
    Effect.runPromise(effect.pipe(Effect.provide(layer)));
  const list = (path: string, query?: string) =>
    run(
      Effect.flatMap(Folders, (folders) =>
        folders.list(query === undefined ? { path } : { path, query }),
      ),
    );
  const listFails = (path: string) =>
    run(
      Effect.flip(Effect.flatMap(Folders, (folders) => folders.list({ path }))),
    );
  const create = (parent: string, name: string) =>
    run(Effect.flatMap(Folders, (folders) => folders.create({ parent, name })));
  const createFails = (parent: string, name: string) =>
    run(
      Effect.flip(
        Effect.flatMap(Folders, (folders) => folders.create({ parent, name })),
      ),
    );
  return { runtime, control, list, listFails, create, createFails };
};

const names = (listing: {
  readonly folders: ReadonlyArray<{ name: string }>;
}) => listing.folders.map((folder) => folder.name);

describe('listing a folder of the fake', () => {
  it('lists sub-folders name-sorted, hides hidden ones, and says where it is', async () => {
    const { control, list } = computer();
    for (const folder of ['b2', 'B10', 'a'])
      control({ _tag: 'AddFolder', folder: `~/code/${folder}` });
    control({ _tag: 'AddHiddenFolder', in: '~/code', name: 'git' });
    const listing = await list('~/code');
    expect(listing).toMatchObject({
      path: CODE,
      parent: HOME,
      truncated: false,
    });
    expect(names(listing)).toEqual(['a', 'b2', 'B10']);
    expect((await list('~')).parent).toBeNull();
    expect((await list('code')).path).toBe(CODE);
  });

  it('filters by a query, and shows hidden folders only for one starting with a dot', async () => {
    const { control, list } = computer();
    for (const folder of ['foo', 'Food', 'bar', '.config', '.foo'])
      control({ _tag: 'AddFolder', folder: `~/code/${folder}` });
    expect(names(await list('~/code', 'FO'))).toEqual(['foo', 'Food']);
    expect((await list('~/code', '.')).folders).toEqual([
      { name: '.config', hidden: true, link: false },
      { name: '.foo', hidden: true, link: false },
    ]);
  });

  it('holds at most 100 folders, and says when it was cut short', async () => {
    const { control, list } = computer();
    control({ _tag: 'AddManyFolders', in: '~/code', count: 120 });
    const listing = await list('~/code');
    expect(listing.folders).toHaveLength(100);
    expect(listing.truncated).toBe(true);
    const asked = await list('~/code', 'folder-11');
    expect(names(asked)).toEqual(
      Array.from({ length: 10 }, (_, at) => `folder-11${at}`),
    );
    expect(asked.truncated).toBe(false);
  });

  it('lists a symlink to a folder inside home as a link, and leaves out one leading outside', async () => {
    const { control, list } = computer();
    control({ _tag: 'AddFolder', folder: '~/code/real' });
    control({ _tag: 'AddFolder', folder: '/srv/away' });
    control({ _tag: 'AddSymlink', at: '~/code/alias', to: '~/code/real' });
    control({ _tag: 'AddSymlink', at: '~/code/away', to: '/srv/away' });
    control({ _tag: 'AddSymlink', at: '~/code/file', to: '~/code/notes.txt' });
    control({ _tag: 'AddSymlink', at: '~/code/gone', to: '~/code/nothing' });
    expect((await list('~/code')).folders).toEqual([
      { name: 'alias', hidden: false, link: true },
      { name: 'real', hidden: false, link: false },
    ]);
  });

  it('refuses anything outside home, even through a symlink', async () => {
    const { control, listFails } = computer();
    control({ _tag: 'AddFolder', folder: '/srv/away' });
    control({ _tag: 'AddSymlink', at: '~/away', to: '/srv/away' });
    expect(await listFails('/srv/away')).toMatchObject({ _tag: 'OutsideHome' });
    expect(await listFails('~/..')).toMatchObject({ _tag: 'OutsideHome' });
    expect(await listFails('/home/you2')).toMatchObject({
      _tag: 'OutsideHome',
    });
    expect(await listFails('~/away')).toMatchObject({
      _tag: 'OutsideHome',
      path: '/srv/away',
    });
  });

  it('says when a folder is missing, is a file, may not be read, or fails to list', async () => {
    const { control, listFails } = computer();
    expect(await listFails('~/nope')).toMatchObject({ _tag: 'FolderNotFound' });
    expect(await listFails('~/code/notes.txt')).toMatchObject({
      _tag: 'FolderNotFound',
    });
    control({ _tag: 'AddFolder', folder: '~/code/locked' });
    control({ _tag: 'MakeUnreadable', folder: '~/code/locked' });
    expect(await listFails('~/code/locked')).toMatchObject({
      _tag: 'PermissionDenied',
      path: `${CODE}/locked`,
    });
    expect(await listFails('~/code/locked/inside')).toMatchObject({
      _tag: 'PermissionDenied',
    });
    control({ _tag: 'AddFolder', folder: '~/code/broken' });
    control({ _tag: 'MakeFailToList', folder: '~/code/broken' });
    expect(await listFails('~/code/broken')).toMatchObject({
      _tag: 'FolderUnreadable',
      path: `${CODE}/broken`,
      message: `EIO: i/o error, scandir '${CODE}/broken'`,
    });
  });

  it('says a folder that takes over 5 seconds to list could not be read', async () => {
    const { runtime } = computer();
    // The fake's File System, but a listing never answers.
    const slow = Layer.effect(
      FileSystem,
      Effect.map(FileSystem, (files) => ({
        ...files,
        list: () => Effect.never,
      })),
    ).pipe(Layer.provide(fileSystem.serve(runtime)));
    const outcome = await Effect.runPromise(
      Effect.gen(function* () {
        const folders = yield* Folders;
        const fiber = yield* Effect.forkChild(
          Effect.flip(folders.list({ path: '~/code' })),
        );
        yield* TestClock.adjust('5 seconds');
        return yield* Fiber.join(fiber);
      }).pipe(
        Effect.provide(homeFolders.pipe(Layer.provide(slow))),
        Effect.provide(TestClock.layer()),
      ),
    );
    expect(outcome).toMatchObject({
      _tag: 'FolderUnreadable',
      message: 'Listing it took too long',
    });
  });
});

describe('a folder slow to list on the fake', () => {
  it('could not be read once it takes over 5 seconds', async () => {
    const { runtime, control } = computer();
    control({ _tag: 'MakeSlowToList', folder: '~/code' });
    const outcome = await Effect.runPromise(
      Effect.gen(function* () {
        const folders = yield* Folders;
        const fiber = yield* Effect.forkChild(
          Effect.flip(folders.list({ path: '~/code' })),
        );
        yield* TestClock.adjust('5 seconds');
        return yield* Fiber.join(fiber);
      }).pipe(
        Effect.provide(
          homeFolders.pipe(Layer.provide(fileSystem.serve(runtime))),
        ),
        Effect.provide(TestClock.layer()),
      ),
    );
    expect(outcome).toMatchObject({
      _tag: 'FolderUnreadable',
      path: CODE,
      message: 'Listing it took too long',
    });
  });
});

describe('creating a folder on the fake', () => {
  it('makes the folder as a Message to the fake, and no git repository in it', async () => {
    const { runtime, create, list } = computer();
    const sent: Array<string> = [];
    runtime.subscribe((entries) => {
      for (const entry of entries) sent.push(entry.message._tag);
    });
    expect(await create('~/code', 'fresh')).toEqual({
      path: `${CODE}/fresh`,
    });
    expect(sent).toEqual(['FolderMade']);
    expect(runtime.root.model.tree[`${CODE}/fresh`]).toMatchObject({
      _tag: 'Folder',
    });
    expect(runtime.root.model.tree[`${CODE}/fresh/.git`]).toBeUndefined();
    expect(names(await list('~/code'))).toEqual(['fresh']);
  });

  it('refuses bad names, a folder already there, a missing parent and one outside home', async () => {
    const { control, createFails, runtime } = computer();
    control({ _tag: 'AddFolder', folder: '~/code/taken' });
    for (const name of ['', '..', 'a/b', ' padded', 'a\0b', 'x'.repeat(256)])
      expect(await createFails('~/code', name)).toMatchObject({
        _tag: 'InvalidFolderName',
        name,
      });
    expect(await createFails('~/code', 'taken')).toMatchObject({
      _tag: 'FolderExists',
    });
    expect(await createFails('~/code', 'notes.txt')).toMatchObject({
      _tag: 'FolderExists',
    });
    // Never makes the parents.
    expect(await createFails('~/code/new/deeper', 'x')).toMatchObject({
      _tag: 'FolderNotFound',
    });
    expect(runtime.root.model.tree[`${CODE}/new`]).toBeUndefined();
    control({ _tag: 'AddFolder', folder: '/srv' });
    expect(await createFails('/srv', 'x')).toMatchObject({
      _tag: 'OutsideHome',
    });
  });

  it('says when it may not write the parent', async () => {
    const { control, createFails } = computer();
    control({ _tag: 'AddFolder', folder: '~/code/locked' });
    control({ _tag: 'MakeUnreadable', folder: '~/code/locked' });
    expect(await createFails('~/code/locked', 'x')).toMatchObject({
      _tag: 'PermissionDenied',
    });
  });
});
