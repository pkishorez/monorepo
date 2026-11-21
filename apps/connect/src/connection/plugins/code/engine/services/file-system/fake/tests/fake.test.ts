import { Effect } from 'effect';
import { afterEach, describe, expect, it } from 'vitest';
import { Runtime, Snapshot } from '@kestack/kabuki';
import { FileSystem } from '../../../../capabilities/index.js';
import {
  branchOfHead,
  fileSystem,
  GIT_FAILS_NEXT,
  GIT_MISSING,
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

  it('add folders, hidden ones, many at once, and files', async () => {
    const { fs, text, control } = computer();
    control({ _tag: 'AddFolder', folder: 'code/a/b' });
    control({ _tag: 'AddHiddenFolder', in: '~', name: 'config' });
    control({ _tag: 'AddManyFolders', in: 'many', count: 120 });
    control({ _tag: 'AddFile', file: 'code/notes.txt', text: 'hello' });
    expect(await fs((each) => each.list(HOME))).toEqual([
      { name: '.config', kind: 'folder', hidden: true },
      { name: 'code', kind: 'folder', hidden: false },
      { name: 'many', kind: 'folder', hidden: false },
    ]);
    const many = await fs((each) => each.list(`${HOME}/many`));
    expect(many).toHaveLength(120);
    expect(many[0]?.name).toBe('folder-001');
    expect(await fs((each) => each.stat(`${HOME}/code/a/b`))).toEqual({
      kind: 'folder',
    });
    expect(await text(`${HOME}/code/notes.txt`)).toBe('hello');
  });

  it('make a folder unreadable, failing to list, and readable again', async () => {
    const { fs, failure, control } = computer();
    control({ _tag: 'AddFolder', folder: 'locked/inside' });
    control({ _tag: 'MakeUnreadable', folder: 'locked' });
    expect(await failure((each) => each.list(`${HOME}/locked`))).toMatchObject({
      _tag: 'AccessDenied',
      path: `${HOME}/locked`,
    });
    expect(
      await failure((each) => each.stat(`${HOME}/locked/inside`)),
    ).toMatchObject({ _tag: 'AccessDenied' });
    expect(await fs((each) => each.stat(`${HOME}/locked`))).toEqual({
      kind: 'folder',
    });
    control({ _tag: 'MakeReadable', folder: 'locked' });
    control({ _tag: 'MakeFailToList', folder: 'locked' });
    expect(await failure((each) => each.list(`${HOME}/locked`))).toMatchObject({
      _tag: 'IoError',
    });
    control({ _tag: 'MakeReadable', folder: '~/locked' });
    expect(names(await fs((each) => each.list(`${HOME}/locked`)))).toEqual([
      'inside',
    ]);
  });

  it('remove a folder, and put it back with all it held', async () => {
    const { fs, failure, control } = computer();
    control({ _tag: 'AddSampleProject', folder: 'code/shop' });
    control({ _tag: 'RemoveFolder', folder: 'code/shop' });
    expect(await failure((each) => each.stat(SHOP))).toMatchObject({
      _tag: 'NotFound',
    });
    control({ _tag: 'PutFolderBack', folder: 'code/shop' });
    expect(await fs((each) => each.stat(`${SHOP}/src/index.ts`))).toEqual({
      kind: 'file',
    });
    control({ _tag: 'PutFolderBack', folder: 'code/shop' });
  });

  it('add symlinks, inside home and outside it', async () => {
    const { fs, control } = computer();
    control({ _tag: 'AddFolder', folder: 'code/shop' });
    control({ _tag: 'AddFolder', folder: '/etc' });
    control({ _tag: 'AddSymlink', at: 'shop', to: '~/code/shop' });
    control({ _tag: 'AddSymlink', at: 'etc', to: '/etc' });
    expect(await fs((each) => each.list(HOME))).toEqual([
      { name: 'code', kind: 'folder', hidden: false },
      { name: 'etc', kind: 'symlink', hidden: false },
      { name: 'shop', kind: 'symlink', hidden: false },
    ]);
    expect(await fs((each) => each.realpath(`${HOME}/shop`))).toBe(
      `${HOME}/code/shop`,
    );
    expect(await fs((each) => each.realpath(`${HOME}/etc`))).toBe('/etc');
  });

  it("change a repository's .git as git would", async () => {
    const { fs, text, control } = computer();
    control({ _tag: 'AddSampleProject', folder: 'code/shop' });
    control({ _tag: 'SwitchBranch', project: 'code/shop', branch: 'fix/typo' });
    expect(branchOfHead(await text(`${SHOP}/.git/HEAD`))).toBe('fix/typo');

    control({ _tag: 'SwitchBranch', project: 'code/shop', branch: 'spike' });
    expect(await text(`${SHOP}/.git/refs/heads/spike`)).toBe(
      await text(`${SHOP}/.git/refs/heads/fix/typo`),
    );

    control({ _tag: 'AddBranch', project: 'code/shop', branch: 'docs' });
    expect(await text(`${SHOP}/.git/refs/heads/docs`)).toMatch(
      /^[0-9a-f]{40}\n$/,
    );

    control({ _tag: 'AddOriginBranch', project: 'code/shop', branch: 'next' });
    expect(await text(`${originOf(SHOP)}/refs/heads/next`)).toMatch(
      /^[0-9a-f]{40}\n$/,
    );
    expect(
      names(await fs((each) => each.list(`${SHOP}/.git/refs/remotes/origin`))),
    ).not.toContain('next');

    control({ _tag: 'PushBranch', project: 'code/shop', branch: 'docs' });
    const docs = await text(`${SHOP}/.git/refs/heads/docs`);
    expect(await text(`${originOf(SHOP)}/refs/heads/docs`)).toBe(docs);
    expect(await text(`${SHOP}/.git/refs/remotes/origin/docs`)).toBe(docs);
    expect(
      parseConfig(await text(`${SHOP}/.git/config`)).upstreams,
    ).not.toHaveProperty('docs');
  });

  it('make the next git step fail, and git missing', async () => {
    const { fs, failure, text, control } = computer();
    control({ _tag: 'MakeNextGitStepFail', message: 'fatal: no' });
    expect(await text(GIT_FAILS_NEXT)).toBe('fatal: no');
    control({ _tag: 'MakeGitMissing' });
    expect(await fs((each) => each.stat(GIT_MISSING))).toEqual({
      kind: 'file',
    });
    control({ _tag: 'InstallGit' });
    expect(await failure((each) => each.stat(GIT_MISSING))).toMatchObject({
      _tag: 'NotFound',
    });
  });

  it('land with nothing to do where there is nothing for them', async () => {
    const { runtime, control } = computer();
    const before = runtime.root.model;
    control({ _tag: 'MakeUnreadable', folder: 'nothing' });
    control({ _tag: 'SwitchBranch', project: 'nothing', branch: 'main' });
    control({ _tag: 'RemoveFolder', folder: 'nothing' });
    expect(runtime.root.model).toEqual(before);
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

  it('refuses to make a folder in one it may not', async () => {
    const { failure, control } = computer();
    control({ _tag: 'AddFolder', folder: 'locked' });
    control({ _tag: 'MakeUnreadable', folder: 'locked' });
    expect(
      await failure((each) => each.mkdir(`${HOME}/locked/x`)),
    ).toMatchObject({ _tag: 'AccessDenied' });
    expect(
      await failure((each) =>
        each.mkdir(`${HOME}/locked/x/y`, { recursive: true }),
      ),
    ).toMatchObject({ _tag: 'AccessDenied' });
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

  it('follows symlinks to read, and stops at a loop or a file on the way', async () => {
    const { fs, failure, control } = computer();
    control({ _tag: 'AddFile', file: 'code/notes.txt', text: 'hi' });
    control({ _tag: 'AddSymlink', at: 'link', to: '~/code' });
    control({ _tag: 'AddSymlink', at: 'loop', to: '~/loop' });
    control({ _tag: 'AddSymlink', at: 'dangling', to: '~/gone' });
    expect(await fs((each) => each.stat(`${HOME}/link`))).toEqual({
      kind: 'folder',
    });
    expect(await fs((each) => each.realpath(`${HOME}/link/notes.txt`))).toBe(
      `${HOME}/code/notes.txt`,
    );
    expect(await failure((each) => each.stat(`${HOME}/loop`))).toMatchObject({
      _tag: 'IoError',
    });
    expect(
      await failure((each) => each.stat(`${HOME}/dangling`)),
    ).toMatchObject({ _tag: 'NotFound' });
    expect(
      await failure((each) => each.realpath(`${HOME}/code/notes.txt/x`)),
    ).toMatchObject({ _tag: 'NotFound' });
  });

  it('removes a file, a symlink itself, and a folder only when recursive', async () => {
    const { fs, failure, control, sent } = computer();
    control({ _tag: 'AddFile', file: 'code/notes.txt', text: 'hi' });
    control({ _tag: 'AddSymlink', at: 'link', to: '~/code' });
    sent.length = 0;
    await fs((each) => each.remove(`${HOME}/link`));
    expect(await fs((each) => each.stat(`${HOME}/code/notes.txt`))).toEqual({
      kind: 'file',
    });
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
