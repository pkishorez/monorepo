import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Effect } from 'effect';
import { describe, expect, test } from 'vitest';

import { Git, GitError, GitLive } from '../index.js';

type Repo = {
  readonly dir: string;
  readonly git: (...args: string[]) => void;
  readonly write: (path: string, content: string) => Promise<void>;
};

async function withRepo<A>(use: (repo: Repo) => Promise<A>): Promise<A> {
  const dir = await mkdtemp(join(tmpdir(), 'laymos-git-'));
  const git = (...args: string[]) => {
    execFileSync('git', args, { cwd: dir, stdio: 'pipe' });
  };
  const write = async (path: string, content: string) => {
    await writeFile(join(dir, path), content);
  };
  try {
    git('init', '--initial-branch=main');
    git('config', 'user.email', 'test@example.com');
    git('config', 'user.name', 'Test');
    git('config', 'commit.gpgsign', 'false');
    await write('kept.ts', 'export const kept = 1;\n');
    await write('edited.ts', 'export const edited = 1;\n');
    await write('gone.ts', 'export const gone = 1;\n');
    git('add', '--all');
    git('commit', '-m', 'initial');
    return await use({ dir, git, write });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function changeSet(baseDir: string, baseRef = 'HEAD') {
  return Effect.gen(function* () {
    const service = yield* Git;
    return yield* service.changeSet(baseDir, baseRef);
  }).pipe(Effect.provide(GitLive), Effect.runPromise);
}

function fileDiff(baseDir: string, path: string, baseRef = 'HEAD') {
  return Effect.gen(function* () {
    const service = yield* Git;
    return yield* service.fileDiff(baseDir, baseRef, path);
  }).pipe(Effect.provide(GitLive), Effect.runPromise);
}

describe('Git change set', () => {
  test('reports untracked files as added', async () => {
    await withRepo(async ({ dir, write }) => {
      await write('fresh.ts', 'export const fresh = 1;\n');

      const actual = await changeSet(dir);

      expect(actual.files).toContainEqual({
        path: 'fresh.ts',
        status: 'added',
      });
    });
  });

  test('reports edited tracked files as modified', async () => {
    await withRepo(async ({ dir, write }) => {
      await write('edited.ts', 'export const edited = 2;\n');

      const actual = await changeSet(dir);

      expect(actual.files).toContainEqual({
        path: 'edited.ts',
        status: 'modified',
      });
    });
  });

  test('omits deleted files entirely', async () => {
    await withRepo(async ({ dir }) => {
      await rm(join(dir, 'gone.ts'));

      const actual = await changeSet(dir);

      expect(actual.files.map(({ path }) => path)).not.toContain('gone.ts');
    });
  });

  test('reads a rename as an addition, never a rename', async () => {
    await withRepo(async ({ dir, git }) => {
      git('mv', 'kept.ts', 'renamed.ts');

      const actual = await changeSet(dir);

      expect(actual.files).toContainEqual({
        path: 'renamed.ts',
        status: 'added',
      });
      expect(actual.files.map(({ path }) => path)).not.toContain('kept.ts');
    });
  });

  test('resolves paths relative to the given folder, not the repo root', async () => {
    await withRepo(async ({ dir }) => {
      const nested = join(dir, 'pkg');
      await mkdir(nested);
      await writeFile(join(nested, 'inner.ts'), 'export const inner = 1;\n');

      const actual = await changeSet(nested);

      expect(actual.files).toEqual([{ path: 'inner.ts', status: 'added' }]);
    });
  });

  test('compares against the merge-base of a branch, not its tip', async () => {
    await withRepo(async ({ dir, git, write }) => {
      git('checkout', '-b', 'feature');
      await write('edited.ts', 'export const edited = 3;\n');
      git('commit', '-am', 'feature work');
      git('checkout', 'main');
      await write('kept.ts', 'export const kept = 2;\n');
      git('commit', '-am', 'unrelated main work');
      git('checkout', 'feature');

      const actual = await changeSet(dir, 'main');

      expect(actual.files.map(({ path }) => path)).toEqual(['edited.ts']);
    });
  });

  test('fails when the folder is not a git repository', async () => {
    const plain = await mkdtemp(join(tmpdir(), 'laymos-plain-'));
    try {
      const actual = await Effect.gen(function* () {
        const service = yield* Git;
        return yield* service.changeSet(plain, 'HEAD');
      }).pipe(Effect.provide(GitLive), Effect.flip, Effect.runPromise);

      expect(actual).toBeInstanceOf(GitError);
      expect(actual.reason).toBe('not-a-repo');
    } finally {
      await rm(plain, { recursive: true, force: true });
    }
  });
});

describe('Git file diff', () => {
  test('returns hunks carrying removed and added lines', async () => {
    await withRepo(async ({ dir, write }) => {
      await write('edited.ts', 'export const edited = 2;\n');

      const actual = await fileDiff(dir, 'edited.ts');

      expect(actual.path).toBe('edited.ts');
      expect(actual.hunks).toHaveLength(1);
      expect(actual.hunks[0]?.lines).toEqual([
        {
          kind: 'removed',
          content: 'export const edited = 1;',
          oldNumber: 1,
        },
        { kind: 'added', content: 'export const edited = 2;', newNumber: 1 },
      ]);
    });
  });
});

describe('Git file diff context', () => {
  test('carries the whole file so both sides can be read in full', async () => {
    await withRepo(async ({ dir, git, write }) => {
      const before = Array.from(
        { length: 40 },
        (_, index) => `const line${index} = ${index};`,
      );
      await write('long.ts', `${before.join('\n')}\n`);
      git('add', '--all');
      git('commit', '-m', 'long file');
      const after = [...before];
      after[20] = 'const line20 = 999;';
      await write('long.ts', `${after.join('\n')}\n`);

      const actual = await fileDiff(dir, 'long.ts');

      expect(actual.hunks).toHaveLength(1);
      const kinds = actual.hunks[0]?.lines.map(({ kind }) => kind) ?? [];
      expect(kinds.filter((kind) => kind === 'context')).toHaveLength(39);
      expect(kinds.filter((kind) => kind === 'removed')).toHaveLength(1);
      expect(kinds.filter((kind) => kind === 'added')).toHaveLength(1);
    });
  });
});
