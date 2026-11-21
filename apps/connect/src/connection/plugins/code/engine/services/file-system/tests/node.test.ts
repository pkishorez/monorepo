import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { Effect } from 'effect';
import { afterEach, describe, expect, it } from 'vitest';
import { FileSystem } from '../../../capabilities/index.js';
import { nodeFileSystem } from '../index.js';

/*
 * The File System of this computer over a made-up folder: what each call
 * answers, and which of the key's errors Node's failures become.
 */

const made: Array<string> = [];
afterEach(() => {
  const paths = made.splice(0);
  for (const path of paths) chmodSync(path, 0o755);
  for (const path of paths) rmSync(path, { recursive: true, force: true });
});

/** A folder holding `code/` with a file in it, and `.hidden/`. */
const temp = () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'connect-fs-')));
  made.push(root);
  mkdirSync(join(root, 'code'));
  mkdirSync(join(root, '.hidden'));
  writeFileSync(join(root, 'code', 'notes.txt'), 'hello');
  return root;
};

const run = <A, E>(effect: Effect.Effect<A, E, FileSystem>) =>
  Effect.runPromise(effect.pipe(Effect.provide(nodeFileSystem)));

const fs = <A, E>(use: (fs: FileSystem['Service']) => Effect.Effect<A, E>) =>
  run(Effect.flatMap(FileSystem, use));

const failure = <A, E>(
  use: (fs: FileSystem['Service']) => Effect.Effect<A, E>,
) => run(Effect.flip(Effect.flatMap(FileSystem, use)));

describe('the File System of this computer', () => {
  it('is at home where Node says', async () => {
    expect(await fs((each) => Effect.succeed(each.home))).toBe(homedir());
  });

  it('lists a folder name-sorted, each entry with its kind and whether it is hidden', async () => {
    const root = temp();
    symlinkSync(join(root, 'code'), join(root, 'link'));
    expect(await fs((each) => each.list(root))).toEqual([
      { name: '.hidden', kind: 'folder', hidden: true },
      { name: 'code', kind: 'folder', hidden: false },
      { name: 'link', kind: 'symlink', hidden: false },
    ]);
    expect(await fs((each) => each.list(join(root, 'code')))).toEqual([
      { name: 'notes.txt', kind: 'file', hidden: false },
    ]);
  });

  it('says what a path is, its symlinks followed, and resolves them', async () => {
    const root = temp();
    symlinkSync(join(root, 'code'), join(root, 'link'));
    expect(await fs((each) => each.stat(join(root, 'link')))).toEqual({
      kind: 'folder',
    });
    expect(
      await fs((each) => each.stat(join(root, 'code', 'notes.txt'))),
    ).toEqual({ kind: 'file' });
    expect(
      await fs((each) => each.realpath(join(root, 'link', 'notes.txt'))),
    ).toBe(join(root, 'code', 'notes.txt'));
  });

  it('fails NotFound for nothing there, or a path through a file', async () => {
    const root = temp();
    const missing = join(root, 'missing');
    expect(await failure((each) => each.stat(missing))).toMatchObject({
      _tag: 'NotFound',
      path: missing,
    });
    expect(await failure((each) => each.list(missing))).toMatchObject({
      _tag: 'NotFound',
    });
    expect(
      await failure((each) =>
        each.realpath(join(root, 'code', 'notes.txt', 'x')),
      ),
    ).toMatchObject({ _tag: 'NotFound' });
  });

  it('fails AccessDenied for a folder this user may not read', async () => {
    const root = temp();
    const locked = join(root, 'locked');
    mkdirSync(locked);
    mkdirSync(join(locked, 'inside'));
    chmodSync(locked, 0o000);
    made.push(locked);
    expect(await failure((each) => each.list(locked))).toMatchObject({
      _tag: 'AccessDenied',
      path: locked,
    });
    expect(
      await failure((each) => each.stat(join(locked, 'inside'))),
    ).toMatchObject({ _tag: 'AccessDenied' });
  });

  it('makes a folder in one that is there, and every one on the way when recursive', async () => {
    const root = temp();
    await fs((each) => each.mkdir(join(root, 'new')));
    expect(existsSync(join(root, 'new'))).toBe(true);
    expect(
      await failure((each) => each.mkdir(join(root, 'new'))),
    ).toMatchObject({ _tag: 'AlreadyExists', path: join(root, 'new') });
    expect(
      await failure((each) => each.mkdir(join(root, 'a', 'b'))),
    ).toMatchObject({ _tag: 'NotFound' });
    await fs((each) => each.mkdir(join(root, 'a', 'b'), { recursive: true }));
    await fs((each) => each.mkdir(join(root, 'a', 'b'), { recursive: true }));
    expect(existsSync(join(root, 'a', 'b'))).toBe(true);
  });

  it('reads and writes a file, bytes or text', async () => {
    const root = temp();
    const path = join(root, 'code', 'data.bin');
    await fs((each) => each.writeFile(path, new Uint8Array([0, 255, 1])));
    expect(await fs((each) => each.readFile(path))).toEqual(
      new Uint8Array([0, 255, 1]),
    );
    await fs((each) => each.writeFile(path, 'héllo'));
    expect(readFileSync(path, 'utf8')).toBe('héllo');
    expect(
      await failure((each) => each.writeFile(join(root, 'no', 'x.txt'), '')),
    ).toMatchObject({ _tag: 'NotFound' });
    expect(
      await failure((each) => each.readFile(join(root, 'code'))),
    ).toMatchObject({ _tag: 'IoError' });
  });

  it('removes a file, a symlink itself, and a folder only when recursive', async () => {
    const root = temp();
    symlinkSync(join(root, 'code'), join(root, 'link'));
    await fs((each) => each.remove(join(root, 'link')));
    expect(existsSync(join(root, 'link'))).toBe(false);
    expect(existsSync(join(root, 'code', 'notes.txt'))).toBe(true);
    expect(
      await failure((each) => each.remove(join(root, 'code'))),
    ).toMatchObject({ _tag: 'IoError' });
    await fs((each) => each.remove(join(root, 'code'), { recursive: true }));
    expect(existsSync(join(root, 'code'))).toBe(false);
    expect(
      await failure((each) => each.remove(join(root, 'code'))),
    ).toMatchObject({ _tag: 'NotFound' });
    await fs((each) => each.remove(join(root, 'code'), { force: true }));
  });
});
