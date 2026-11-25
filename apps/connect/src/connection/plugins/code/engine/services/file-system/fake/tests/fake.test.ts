import { Effect } from 'effect';
import { afterEach, describe, expect, it } from 'vitest';
import { Runtime, Snapshot } from '@kestack/kabuki';
import { FileSystem } from '../../../../capabilities/index.js';
import {
  branchOfHead,
  fileSystem,
  originOf,
  parseConfig,
  type FileSystemMessage,
} from '../index.js';

/*
 * The File System Fake: what its Controls make of a blank computer, and
 * what the File System key answers over it, as node.ts would on a disk
 * like it. Every change the key makes is a Message.
 */

const HOME = '/home/you';
const SHOP = `${HOME}/code/shop`;

const opened: Array<Runtime<typeof fileSystem.actor>> = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((runtime) => runtime.dispose()));
});

/** A blank fake computer, the tags of the Messages it was Sent, and its key. */
const computer = () => {
  const runtime = Runtime.make(fileSystem.actor);
  opened.push(runtime);
  const sent: Array<string> = [];
  runtime.subscribe((entries) => {
    for (const entry of entries) sent.push(entry.message._tag);
  });
  const layer = fileSystem.serve(runtime);
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
  const control = (message: FileSystemMessage) =>
    expect(runtime.root.send(message)).toBe('handled');
  const text = (path: string) =>
    fs((each) => each.readFile(path)).then((bytes) =>
      new TextDecoder().decode(bytes),
    );
  return { runtime, sent, fs, failure, control, text };
};

const names = (entries: ReadonlyArray<{ readonly name: string }>) =>
  entries.map(({ name }) => name);

describe('a blank computer', () => {
  it('has an empty home at /home/you', async () => {
    const { fs } = computer();
    expect(await fs((each) => Effect.succeed(each.home))).toBe(HOME);
    expect(await fs((each) => each.list(HOME))).toEqual([]);
    expect(await fs((each) => each.list('/home'))).toEqual([
      { name: 'you', kind: 'folder', hidden: false },
    ]);
  });

  it('offers its Controls, each a Message of its Actor', () => {
    expect(fileSystem.name).toBe('File System');
    expect(fileSystem.controls).toContain('AddSampleProject');
    expect(fileSystem.controls).not.toContain('FolderMade');
  });

  it('is the same after a Snapshot saved and loaded', () => {
    const { runtime, control } = computer();
    control({ _tag: 'AddSampleProject', folder: 'code/shop' });
    const saved = Snapshot.save(fileSystem.actor, runtime.snapshot);
    const again = Runtime.make(fileSystem.actor, {
      snapshot: Snapshot.load(
        fileSystem.actor,
        JSON.parse(JSON.stringify(saved)),
      ),
    });
    opened.push(again);
    expect(again.root.model).toEqual(runtime.root.model);
  });
});

describe('the Controls', () => {
  it('add a sample project: files, and a repository as git keeps it', async () => {
    const { fs, text, control } = computer();
    control({ _tag: 'AddSampleProject', folder: '~/code/shop' });
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
    control({ _tag: 'AddFolder', folder: 'code/a/b' });
    control({ _tag: 'AddFolder', folder: '~/.config' });
    control({ _tag: 'AddFile', file: 'code/notes.txt', text: 'hello' });
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
  it('makes folders, each change a Message', async () => {
    const { fs, failure, sent } = computer();
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
    expect(sent).toEqual(['FolderMade', 'FolderMade']);
  });

  it('reads and writes files, bytes or text', async () => {
    const { fs, failure, text, control } = computer();
    control({ _tag: 'AddFolder', folder: 'code' });
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
    control({ _tag: 'AddFile', file: 'code/notes.txt', text: 'hi' });
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
    const { fs, failure, control, sent } = computer();
    control({ _tag: 'AddFile', file: 'code/notes.txt', text: 'hi' });
    control({ _tag: 'AddFile', file: 'code/todo.txt', text: '' });
    sent.length = 0;
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
    expect(sent).toEqual(['PathRemoved', 'PathRemoved']);
  });

  it('fails a change once the fake is stopped', async () => {
    const { runtime, failure } = computer();
    await runtime.stop();
    expect(await failure((each) => each.mkdir(`${HOME}/new`))).toMatchObject({
      _tag: 'IoError',
    });
  });
});
