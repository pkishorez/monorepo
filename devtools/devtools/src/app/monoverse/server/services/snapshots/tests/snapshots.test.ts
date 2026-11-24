import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  readlink,
  rm,
  stat,
  symlink,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Effect } from 'effect';
import { describe, expect, test, vi } from 'vitest';

import { readText } from '../../../rpc/project/real/read-text.js';
import { commitFolder } from '../real/commit-copy.js';
import { mainFiles, withFixture } from '../../../tests/git-fixture.js';
import { copies as testCopies, openSnapshot } from '../../../tests/services.js';

const open = (root: string, branch: string | null) =>
  Effect.runPromise(openSnapshot(root, branch));

describe('a Project at a branch', () => {
  test('null is the folder as it is on disk', () =>
    withFixture(async ({ repo, write }) => {
      await write(join(repo, 'loose.txt'), 'loose\n');
      const snapshot = await open(repo, null);
      expect(snapshot.source).toEqual({ kind: 'disk', folder: repo });
      expect(await snapshot.list('')).toContain('loose.txt');
    }));

  test('a branch no worktree has is read from git at its last commit', () =>
    withFixture(async ({ repo, write }) => {
      // Untracked work in the folder is not the branch's.
      await write(join(repo, 'loose.txt'), 'loose\n');
      const snapshot = await open(repo, 'feature');
      expect(snapshot.source.kind).toBe('git');
      expect(await snapshot.list('')).toEqual(
        [...Object.keys(mainFiles), 'packages/core/src/feature.ts'].sort(
          (left, right) => left.localeCompare(right),
        ),
      );
      expect(await snapshot.list('packages/core/src')).toEqual([
        'packages/core/src/feature.ts',
        'packages/core/src/index.ts',
        'packages/core/src/util.ts',
      ]);
      expect(await readText(snapshot, 'README.md')).toBe(
        '# Fixture\n\nOn feature.\n',
      );
      expect(await snapshot.read('loose.txt')).toBeUndefined();
      const many = await snapshot.readMany([
        'packages/core/src/util.ts',
        'packages/core/src/feature.ts',
        'missing.ts',
      ]);
      expect([...many.keys()].sort()).toEqual([
        'packages/core/src/feature.ts',
        'packages/core/src/util.ts',
      ]);
      expect(
        new TextDecoder().decode(many.get('packages/core/src/util.ts')),
      ).toBe(mainFiles['packages/core/src/util.ts']);
    }));

  test('a branch read from git is on disk as a copy of its commit; on disk, as its folder', () =>
    withFixture(async ({ repo, git, write }) => {
      // A symbolic link in the commit is one in the copy.
      git(repo, 'checkout', '-q', 'feature');
      await symlink('util.ts', join(repo, 'packages/core/src/alias.ts'));
      git(repo, 'add', '--all');
      git(repo, 'commit', '-q', '-m', 'link');
      git(repo, 'checkout', '-q', 'main');
      await write(join(repo, 'loose.txt'), 'loose\n');

      const fromGit = await open(repo, 'feature');
      const copy = await fromGit.onDisk();
      expect(copy.startsWith(testCopies)).toBe(true);
      expect(
        await readFile(join(copy, 'packages/core/src/feature.ts'), 'utf8'),
      ).toContain('feature');
      expect(await readlink(join(copy, 'packages/core/src/alias.ts'))).toBe(
        'util.ts',
      );
      expect(await readdir(copy)).not.toContain('loose.txt');
      expect(await (await open(repo, null)).onDisk()).toBe(repo);

      // A Project inside the repository is its folder in a copy of the
      // whole commit, with what sits above it.
      const inner = await open(join(repo, 'packages/core'), 'feature');
      const innerCopy = await inner.onDisk();
      expect(innerCopy).toBe(join(copy, 'packages/core'));
      expect(await readdir(join(innerCopy, '../..'))).toContain(
        'pnpm-workspace.yaml',
      );
    }));

  test('a branch checked out in a worktree is read from it, uncommitted work included', () =>
    withFixture(async ({ repo, worktree }) => {
      const snapshot = await open(repo, 'wip');
      expect(snapshot.source).toEqual({ kind: 'disk', folder: worktree });
      expect(snapshot.root).toBe(repo);
      expect(await snapshot.list('packages/core')).toContain(
        'packages/core/src/draft.ts',
      );
      expect(await readText(snapshot, 'README.md')).toBe(
        '# Fixture\n\nWork in progress.\n',
      );
    }));

  test("the folder's own branch is the folder itself", () =>
    withFixture(async ({ repo }) => {
      const snapshot = await open(repo, 'main');
      expect(snapshot.source).toEqual({ kind: 'disk', folder: repo });
    }));

  test('a Project inside the repository reads its own folder at the branch', () =>
    withFixture(async ({ repo, worktree }) => {
      const root = join(repo, 'packages/core');
      const fromGit = await open(root, 'feature');
      expect(await fromGit.list('')).toEqual([
        'package.json',
        'src/feature.ts',
        'src/index.ts',
        'src/util.ts',
      ]);
      expect(await readText(fromGit, 'src/feature.ts')).toContain('feature');

      const fromWorktree = await open(root, 'wip');
      expect(fromWorktree.source).toEqual({
        kind: 'disk',
        folder: join(worktree, 'packages/core'),
      });
      expect(await fromWorktree.list('src')).toContain('src/draft.ts');
    }));

  test('an unknown branch, or a folder outside git, fails as git unavailable', () =>
    withFixture(async ({ repo }) => {
      expect(
        await Effect.runPromise(openSnapshot(repo, 'nope').pipe(Effect.flip)),
      ).toMatchObject({ _tag: 'GitUnavailableError', reason: 'unknown-ref' });
      expect(
        await Effect.runPromise(
          openSnapshot(repo, '--output=x').pipe(Effect.flip),
        ),
      ).toMatchObject({ _tag: 'GitUnavailableError', reason: 'unknown-ref' });
      expect(
        await Effect.runPromise(
          openSnapshot(join(repo, 'missing'), null).pipe(Effect.flip),
        ),
      ).toMatchObject({ _tag: 'InvalidRootError', reason: 'not-found' });
    }));
});

describe("a commit's copy on disk", () => {
  const files: Record<string, string> = {
    'package.json': '{}',
    'packages/a/package.json': '{}',
    'packages/a/src/index.ts': 'export {};',
    'packages/a/src/link.ts': 'index.ts',
  };
  const copyOf = (
    copies: string,
    checkout: string,
    commit: string,
    folderOf = commitFolder,
  ) =>
    folderOf({
      copies,
      commit,
      checkout,
      list: async () =>
        Object.keys(files).map((path) => ({
          path,
          link: path.endsWith('link.ts'),
        })),
      readMany: async (paths) =>
        new Map(
          paths.map((path) => [path, new TextEncoder().encode(files[path])]),
        ),
    });

  test('is written whole once, reused while whole, and only the last few are kept', async () => {
    const at = await mkdtemp(join(tmpdir(), 'monoverse-copies-'));
    const copies = join(at, 'copies');
    const checkout = join(at, 'checkout');
    try {
      await mkdir(join(checkout, 'packages/a/node_modules/x'), {
        recursive: true,
      });
      const folder = await copyOf(copies, checkout, 'c0');
      expect(folder).toBe(join(copies, 'c0'));
      expect(
        await readFile(join(folder, 'packages/a/src/index.ts'), 'utf8'),
      ).toBe('export {};');
      // A symbolic link stays one.
      expect(await readlink(join(folder, 'packages/a/src/link.ts'))).toBe(
        'index.ts',
      );
      // Each node_modules the checkout has is linked, not copied.
      const link = join(folder, 'packages/a/node_modules');
      expect((await lstat(link)).isSymbolicLink()).toBe(true);
      expect(await readlink(link)).toBe(
        join(checkout, 'packages/a/node_modules'),
      );

      // Opened again, the copy is the same one, not written anew.
      await writeFile(join(folder, 'extra'), '');
      const old = new Date(Date.now() - 60_000);
      await utimes(folder, old, old);
      expect(await copyOf(copies, checkout, 'c0')).toBe(folder);
      expect(await readdir(folder)).toContain('extra');
      expect((await stat(folder)).mtimeMs).toBeGreaterThan(old.getTime());

      // Each file is looked for once per process; after that, the marker
      // is trusted.
      await rm(join(folder, 'packages/a/src/index.ts'));
      await copyOf(copies, checkout, 'c0');
      expect(await readdir(folder)).toContain('extra');
      // In a new process, a copy the OS has half cleared away is written
      // again.
      vi.resetModules();
      const fresh = (await import('../real/commit-copy.js')).commitFolder;
      expect(await copyOf(copies, checkout, 'c0', fresh)).toBe(folder);
      expect(await readdir(folder)).not.toContain('extra');
      expect(
        await readFile(join(folder, 'packages/a/src/index.ts'), 'utf8'),
      ).toBe('export {};');
      // So is one without its marker, which a write that died leaves.
      await rm(join(folder, '.kestack-devtools-copy.json'));
      await writeFile(join(folder, 'extra'), '');
      await copyOf(copies, checkout, 'c0');
      expect(await readdir(folder)).not.toContain('extra');

      // Two opens at once write one copy, and no half-written one stays.
      const [left, right] = await Promise.all([
        copyOf(copies, checkout, 'c1'),
        copyOf(copies, checkout, 'c1'),
      ]);
      expect(left).toBe(right);
      expect(
        (await readdir(copies)).filter((name) => name.startsWith('.')),
      ).toEqual([]);

      // Only the six used last stay, and removing one leaves what its
      // links point to.
      for (const commit of ['c2', 'c3', 'c4', 'c5', 'c6', 'c7'])
        await copyOf(copies, checkout, commit);
      expect((await readdir(copies)).sort()).toEqual([
        'c2',
        'c3',
        'c4',
        'c5',
        'c6',
        'c7',
      ]);
      expect(
        (await stat(join(checkout, 'packages/a/node_modules/x'))).isDirectory(),
      ).toBe(true);

      // Many writes at once each prune, past what the others removed.
      const many = Array.from({ length: 12 }, (_, i) => `d${i}`);
      await Promise.all(many.map((commit) => copyOf(copies, checkout, commit)));
      expect((await readdir(copies)).length).toBeLessThanOrEqual(12);
    } finally {
      await rm(at, { recursive: true, force: true });
    }
  });

  test("links the checkout's node_modules again where one is missing or points at nothing", async () => {
    const at = await mkdtemp(join(tmpdir(), 'monoverse-copies-'));
    const copies = join(at, 'copies');
    const before = join(at, 'before');
    const after = join(at, 'after');
    const link = (folder: string) => join(folder, 'packages/a/node_modules');
    try {
      // Written before the install: nothing to link.
      await mkdir(before, { recursive: true });
      const folder = await copyOf(copies, before, 'c0');
      expect(await readdir(join(folder, 'packages/a'))).not.toContain(
        'node_modules',
      );
      await mkdir(join(before, 'packages/a/node_modules'), { recursive: true });
      await copyOf(copies, before, 'c0');
      expect(await readlink(link(folder))).toBe(link(before));

      // The worktree it was linked to is gone; another has node_modules.
      await rm(before, { recursive: true, force: true });
      await mkdir(join(after, 'packages/a/node_modules'), { recursive: true });
      await copyOf(copies, after, 'c0');
      expect(await readlink(link(folder))).toBe(link(after));
    } finally {
      await rm(at, { recursive: true, force: true });
    }
  });
});
