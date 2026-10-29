import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Effect, Exit } from 'effect';
import { afterEach, describe, expect, it } from 'vitest';
import { Git } from '../../../capabilities/index.js';
import { git } from '../index.js';

/*
 * Git against real repositories in temporary folders: a clone of an Origin
 * of its own, what it lists, and each change a start or a Title makes.
 */

const made: Array<string> = [];
afterEach(() => {
  for (const path of made.splice(0))
    rmSync(path, { recursive: true, force: true });
});
const temp = () => {
  const path = realpathSync(mkdtempSync(join(tmpdir(), 'ai-git-')));
  made.push(path);
  return path;
};

const sh = (cwd: string, ...args: ReadonlyArray<string>) =>
  execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Ada',
      GIT_AUTHOR_EMAIL: 'ada@example.com',
      GIT_COMMITTER_NAME: 'Ada',
      GIT_COMMITTER_EMAIL: 'ada@example.com',
    },
  }).trim();

/**
 * A clone of an Origin with `main` and `feature`: its `main` tracks
 * `origin/main`, and it has the local `topic`, which tracks nothing.
 */
const clone = () => {
  const seed = temp();
  sh(seed, 'init', '-q', '-b', 'main');
  sh(seed, 'commit', '-q', '--allow-empty', '-m', 'first');
  sh(seed, 'branch', 'feature');
  const origin = join(temp(), 'origin.git');
  sh(seed, 'clone', '-q', '--bare', seed, origin);
  const path = join(temp(), 'repo');
  sh(seed, 'clone', '-q', origin, path);
  sh(path, 'branch', 'topic');
  return realpathSync(path);
};

const run = <A, E>(effect: (git: Git['Service']) => Effect.Effect<A, E>) =>
  Effect.runPromise(
    Effect.scoped(Effect.flatMap(Git, effect)).pipe(Effect.provide(git)),
  );

const runExit = <A, E>(effect: (git: Git['Service']) => Effect.Effect<A, E>) =>
  Effect.runPromise(
    Effect.scoped(Effect.exit(Effect.flatMap(Git, effect))).pipe(
      Effect.provide(git),
    ),
  );

describe('git', () => {
  it('reads a folder that is not a repository, or inside one, as not git', async () => {
    const plain = temp();
    const repo = clone();
    const inside = join(repo, 'sub');
    mkdirSync(inside);
    for (const path of [plain, inside, join(plain, 'gone')]) {
      expect(await run((git) => git.branches(path))).toBeNull();
      expect(await run((git) => git.branchAt(path))).toBeNull();
    }
  });

  it('lists local branches with what they track, Origin branches, and the Worktrees', async () => {
    const repo = clone();
    const found = await run((git) => git.branches(repo));
    expect(found).toEqual({
      current: 'main',
      worktrees: [{ path: repo, branch: 'main' }],
      local: [
        { name: 'main', upstream: 'origin/main', worktree: repo },
        { name: 'topic', upstream: null, worktree: null },
      ],
      origin: ['origin/feature', 'origin/main'],
    });
    expect(await run((git) => git.branchAt(repo))).toBe('main');
  });

  it('switches the folder to a local branch, and to an Origin one through a local one that tracks it', async () => {
    const repo = clone();
    await run((git) => git.switchTo(repo, 'topic'));
    expect(sh(repo, 'branch', '--show-current')).toBe('topic');
    await run((git) => git.switchTo(repo, 'origin/feature'));
    expect(sh(repo, 'branch', '--show-current')).toBe('feature');
    expect(sh(repo, 'rev-parse', '--abbrev-ref', 'feature@{upstream}')).toBe(
      'origin/feature',
    );
    const missing = await runExit((git) => git.switchTo(repo, 'nowhere'));
    expect(Exit.isFailure(missing)).toBe(true);
  });

  it('makes a Worktree on a new branch from a local branch and from an Origin one, tracking nothing', async () => {
    const repo = clone();
    const worktrees = temp();
    const fromLocal = join(worktrees, 'p1', 'one');
    const fromOrigin = join(worktrees, 'p1', 'two');
    await run((git) =>
      git.addWorktree(repo, {
        at: fromLocal,
        branch: 'ke-code/one',
        from: 'topic',
      }),
    );
    await run((git) =>
      git.addWorktree(repo, {
        at: fromOrigin,
        branch: 'ke-code/two',
        from: 'origin/feature',
      }),
    );
    expect(await run((git) => git.branchAt(fromLocal))).toBe('ke-code/one');
    expect(await run((git) => git.branchAt(fromOrigin))).toBe('ke-code/two');
    const found = await run((git) => git.branches(repo));
    expect(found?.worktrees).toEqual([
      { path: repo, branch: 'main' },
      { path: fromLocal, branch: 'ke-code/one' },
      { path: fromOrigin, branch: 'ke-code/two' },
    ]);
    expect(found?.local).toContainEqual({
      name: 'ke-code/two',
      upstream: null,
      worktree: fromOrigin,
    });
    // Asked from a Worktree, that one comes first.
    expect((await run((git) => git.branches(fromLocal)))?.current).toBe(
      'ke-code/one',
    );

    await run((git) =>
      git.removeWorktree(repo, { at: fromLocal, branch: 'ke-code/one' }),
    );
    expect(existsSync(fromLocal)).toBe(false);
    expect(sh(repo, 'branch', '--list', 'ke-code/one')).toBe('');
  });

  it('refuses a Worktree from a branch there is not', async () => {
    const repo = clone();
    const at = join(temp(), 'p1', 'one');
    const exit = await runExit((git) =>
      git.addWorktree(repo, { at, branch: 'ke-code/one', from: 'nowhere' }),
    );
    expect(Exit.isFailure(exit)).toBe(true);
  });

  it('renames a branch to the first free name, and says whether one was pushed', async () => {
    const repo = clone();
    const at = join(temp(), 'p1', 'one');
    await run((git) =>
      git.addWorktree(repo, { at, branch: 'ke-code/one', from: 'main' }),
    );
    expect(await run((git) => git.pushed(at, 'ke-code/one'))).toBe(false);
    sh(repo, 'branch', 'ke-code/fix-login');
    expect(
      await run((git) => git.rename(at, 'ke-code/one', 'ke-code/fix-login')),
    ).toBe('ke-code/fix-login-2');
    expect(await run((git) => git.branchAt(at))).toBe('ke-code/fix-login-2');

    // Tracking a branch, or with one of its name on Origin, it was pushed.
    expect(await run((git) => git.pushed(repo, 'main'))).toBe(true);
    sh(repo, 'branch', '--unset-upstream', 'main');
    expect(await run((git) => git.pushed(repo, 'main'))).toBe(true);
    expect(await run((git) => git.pushed(repo, 'topic'))).toBe(false);
    // Git that cannot say reads as pushed, so nothing is renamed.
    expect(await run((git) => git.pushed(temp(), 'topic'))).toBe(true);
  });

  it('refuses a Worktree where its branch or folder is there already, and leaves them be', async () => {
    const repo = clone();
    const worktrees = temp();
    sh(repo, 'branch', 'ke-code/one');
    const one = join(worktrees, 'p1', 'one');
    const branchTaken = await runExit((git) =>
      git.addWorktree(repo, { at: one, branch: 'ke-code/one', from: 'main' }),
    );
    expect(Exit.isFailure(branchTaken)).toBe(true);
    expect(sh(repo, 'branch', '--list', 'ke-code/one')).not.toBe('');

    const two = join(worktrees, 'p1', 'two');
    mkdirSync(two, { recursive: true });
    writeFileSync(join(two, 'keep'), '');
    const folderTaken = await runExit((git) =>
      git.addWorktree(repo, { at: two, branch: 'ke-code/two', from: 'main' }),
    );
    expect(Exit.isFailure(folderTaken)).toBe(true);
    expect(existsSync(join(two, 'keep'))).toBe(true);
    expect(sh(repo, 'branch', '--list', 'ke-code/two')).toBe('');
  });

  it('reads a branch that looks like an option as a branch, never an option', async () => {
    const repo = clone();
    for (const branch of ['--orphan=oops', '--detach', '-'])
      expect(
        Exit.isFailure(await runExit((git) => git.switchTo(repo, branch))),
      ).toBe(true);
    expect(sh(repo, 'branch', '--show-current')).toBe('main');
    const at = join(temp(), 'p1', 'one');
    const exit = await runExit((git) =>
      git.addWorktree(repo, { at, branch: 'ke-code/one', from: '--detach' }),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    expect(existsSync(at)).toBe(false);
    expect(sh(repo, 'branch', '--list', 'ke-code/one')).toBe('');
  });

  it('refuses an Origin branch whose name a local branch that does not track it has', async () => {
    const repo = clone();
    sh(repo, 'branch', '--no-track', 'feature', 'topic');
    const exit = await runExit((git) => git.switchTo(repo, 'origin/feature'));
    expect(exit).toMatchObject({
      _tag: 'Failure',
      cause: {
        reasons: [{ error: { message: expect.stringContaining('feature') } }],
      },
    });
    expect(sh(repo, 'branch', '--show-current')).toBe('main');
    // Tracking it, the local one is the one switched to.
    sh(repo, 'branch', '--set-upstream-to=origin/feature', 'feature');
    await run((git) => git.switchTo(repo, 'origin/feature'));
    expect(sh(repo, 'branch', '--show-current')).toBe('feature');
  });

  it('renames two branches to one name at once, each to a free one', async () => {
    const repo = clone();
    const worktrees = temp();
    const ats = ['one', 'two', 'three', 'four'].map((id) => ({
      at: join(worktrees, 'p1', id),
      branch: `ke-code/${id}`,
    }));
    for (const each of ats)
      await run((git) => git.addWorktree(repo, { ...each, from: 'main' }));
    const names = await run((git) =>
      Effect.all(
        ats.map(({ at, branch }) => git.rename(at, branch, 'ke-code/fix')),
        { concurrency: 'unbounded' },
      ),
    );
    expect([...names].sort()).toEqual([
      'ke-code/fix',
      'ke-code/fix-2',
      'ke-code/fix-3',
      'ke-code/fix-4',
    ]);
  });

  it('starts a repository, saying why when it cannot', async () => {
    const path = temp();
    expect(await run((git) => git.init(path))).toBeNull();
    expect(existsSync(join(path, '.git'))).toBe(true);
    expect(await run((git) => git.init(join(path, 'gone')))).not.toBeNull();
  });

  it('fetches from Origin in the background', async () => {
    const repo = clone();
    const origin = sh(repo, 'remote', 'get-url', 'origin');
    sh(origin, 'branch', 'later', 'main');
    await run((git) =>
      Effect.gen(function* () {
        yield* git.fetch(repo);
        // A second one while it runs is dropped.
        yield* git.fetch(repo);
        yield* Effect.promise(async () => {
          for (let tries = 0; tries < 100; tries++) {
            if (sh(repo, 'branch', '-r').includes('origin/later')) return;
            await new Promise((done) => setTimeout(done, 20));
          }
          throw new Error('Never fetched');
        });
      }),
    );
  });
});
