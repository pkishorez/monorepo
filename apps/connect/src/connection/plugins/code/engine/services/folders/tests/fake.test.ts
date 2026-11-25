import { Effect, Fiber, Layer, SubscriptionRef } from 'effect';
import { TestClock } from 'effect/testing';
import { describe, expect, it } from 'vitest';
import { FileSystem, Folders } from '../../../capabilities/index.js';
import {
  addFile,
  addFolder,
  diskOf,
  type DiskChange,
  emptyHome,
  fileSystemOver,
  HOME,
} from '../../file-system/fake/index.js';
import { homeFolders } from '../index.js';

/*
 * Folders over the File System fake, as a browser tab runs them: the same
 * listings and refusals as on a disk, the world made by a person's
 * changes to the fake disk, and a new folder made on it.
 */

const CODE = `${HOME}/code`;

/** A blank fake computer with `~/code` and a file in it, and Folders over it. */
const computer = () => {
  const disk = Effect.runSync(SubscriptionRef.make(emptyHome));
  const control = (change: DiskChange) =>
    Effect.runSync(SubscriptionRef.update(disk, change));
  control(addFolder('~/code'));
  control(addFile('~/code/notes.txt', ''));
  const layer = homeFolders.pipe(Layer.provide(fileSystemOver(diskOf(disk))));
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
  return { disk, control, list, listFails, create, createFails };
};

const names = (listing: {
  readonly folders: ReadonlyArray<{ name: string }>;
}) => listing.folders.map((folder) => folder.name);

describe('listing a folder of the fake', () => {
  it('lists sub-folders name-sorted, hides hidden ones, and says where it is', async () => {
    const { control, list } = computer();
    for (const folder of ['b2', 'B10', 'a'])
      control(addFolder(`~/code/${folder}`));
    control(addFolder('~/code/.git'));
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
      control(addFolder(`~/code/${folder}`));
    expect(names(await list('~/code', 'FO'))).toEqual(['foo', 'Food']);
    expect((await list('~/code', '.')).folders).toEqual([
      { name: '.config', hidden: true, link: false },
      { name: '.foo', hidden: true, link: false },
    ]);
  });

  it('holds at most 100 folders, and says when it was cut short', async () => {
    const { control, list } = computer();
    for (let index = 1; index <= 120; index++)
      control(addFolder(`~/code/folder-${String(index).padStart(3, '0')}`));
    const listing = await list('~/code');
    expect(listing.folders).toHaveLength(100);
    expect(listing.truncated).toBe(true);
    const asked = await list('~/code', 'folder-11');
    expect(names(asked)).toEqual(
      Array.from({ length: 10 }, (_, at) => `folder-11${at}`),
    );
    expect(asked.truncated).toBe(false);
  });

  it('refuses anything outside home', async () => {
    const { control, listFails } = computer();
    control(addFolder('/srv/away'));
    expect(await listFails('/srv/away')).toMatchObject({ _tag: 'OutsideHome' });
    expect(await listFails('~/..')).toMatchObject({ _tag: 'OutsideHome' });
    expect(await listFails('/home/you2')).toMatchObject({
      _tag: 'OutsideHome',
    });
  });

  it('says when a folder is missing, or is a file', async () => {
    const { listFails } = computer();
    expect(await listFails('~/nope')).toMatchObject({ _tag: 'FolderNotFound' });
    expect(await listFails('~/code/notes.txt')).toMatchObject({
      _tag: 'FolderNotFound',
    });
  });

  it('says a folder that takes over 5 seconds to list could not be read', async () => {
    const { disk } = computer();
    // The fake's File System, but a listing never answers.
    const slow = Layer.effect(
      FileSystem,
      Effect.map(FileSystem, (files) => ({
        ...files,
        list: () => Effect.never,
      })),
    ).pipe(Layer.provide(fileSystemOver(diskOf(disk))));
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

describe('creating a folder on the fake', () => {
  it('makes the folder on the fake disk, and no git repository in it', async () => {
    const { disk, create, list } = computer();
    expect(await create('~/code', 'fresh')).toEqual({
      path: `${CODE}/fresh`,
    });
    expect(SubscriptionRef.getUnsafe(disk).tree[`${CODE}/fresh`]).toMatchObject(
      {
        _tag: 'Folder',
      },
    );
    expect(
      SubscriptionRef.getUnsafe(disk).tree[`${CODE}/fresh/.git`],
    ).toBeUndefined();
    expect(names(await list('~/code'))).toEqual(['fresh']);
  });

  it('refuses bad names, a folder already there, a missing parent and one outside home', async () => {
    const { control, createFails, disk } = computer();
    control(addFolder('~/code/taken'));
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
    expect(SubscriptionRef.getUnsafe(disk).tree[`${CODE}/new`]).toBeUndefined();
    control(addFolder('/srv'));
    expect(await createFails('/srv', 'x')).toMatchObject({
      _tag: 'OutsideHome',
    });
  });
});
