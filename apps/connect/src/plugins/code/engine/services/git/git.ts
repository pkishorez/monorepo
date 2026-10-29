import { execFile } from 'node:child_process';
import { mkdir, realpath, rm, stat } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Duration, Effect, Layer, Option, Semaphore } from 'effect';
import {
  Git,
  GitError,
  type GitBranches,
  type LocalBranch,
  type MadeBranch,
  type Worktree,
} from '../../capabilities/index.js';

/*
 * Git, run as the `git` on PATH. Every call has a time limit, asks for no
 * password, and reads git's own words, not the user's language. A question
 * that fails, as with git missing, answers null; a fetch is one per folder
 * at a time, in the background, and its failure only logged. What a
 * caller names goes after `--end-of-options`, so git never reads it as an
 * option, and a branch it makes is checked as a name first.
 */

/** How long one git command may take; a fetch may take longer. */
const TIMEOUT = Duration.seconds(10);
const FETCH_TIMEOUT = Duration.seconds(120);

/** The most `-2`, `-3` and on a rename tries before it gives up. */
const MOST_SUFFIX = 100;

const env = { ...process.env, GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C' };

/** Runs git in `cwd`: what it printed, or why it failed. */
const run = (
  cwd: string,
  args: ReadonlyArray<string>,
  timeout: Duration.Duration = TIMEOUT,
) =>
  Effect.callback<string, GitError>((resume) => {
    execFile(
      'git',
      [...args],
      { cwd, env, timeout: Duration.toMillis(timeout), maxBuffer: 16 << 20 },
      (error, stdout, stderr) =>
        resume(
          error === null
            ? Effect.succeed(stdout)
            : Effect.fail(
                new GitError({
                  message: stderr.trim() || error.message || 'git failed',
                }),
              ),
        ),
    );
  });

/** A question's answer; null when git failed. */
const asked = <A>(effect: Effect.Effect<A, GitError>) =>
  Effect.map(Effect.option(effect), Option.getOrNull);

const real = (path: string) =>
  Effect.promise(() => realpath(path).catch(() => path));

const lines = (output: string) => output.split('\n').filter((line) => line);

/** Whether `path` is the top of a Worktree, not a folder inside one. */
const isTop = (path: string) =>
  Effect.gen(function* () {
    const top = yield* run(path, ['rev-parse', '--show-toplevel']);
    return (yield* real(top.trim())) === (yield* real(path));
  });

/** `git worktree list --porcelain -z`, each Worktree that is there. */
const worktreesOf = (path: string) =>
  Effect.gen(function* () {
    const output = yield* run(path, ['worktree', 'list', '--porcelain', '-z']);
    const found: Array<Worktree & { readonly gone: boolean }> = [];
    let current: { path: string; branch: string | null; gone: boolean } | null =
      null;
    for (const field of output.split('\0')) {
      if (field.startsWith('worktree ')) {
        current = { path: field.slice(9), branch: null, gone: false };
        found.push(current);
      } else if (current === null) continue;
      else if (field.startsWith('branch refs/heads/'))
        current.branch = field.slice(18);
      else if (field === 'bare' || field.startsWith('prunable'))
        current.gone = true;
    }
    return yield* Effect.forEach(
      found.filter((each) => !each.gone),
      (each) =>
        Effect.map(real(each.path), (path) => ({ path, branch: each.branch })),
    );
  });

const branches = (path: string) =>
  asked(
    Effect.gen(function* () {
      if (!(yield* isTop(path))) return null;
      const here = yield* real(path);
      const worktrees = yield* worktreesOf(path);
      const heads = yield* run(path, [
        'for-each-ref',
        '--format=%(refname:lstrip=2)%00%(upstream)%00%(worktreepath)',
        '--end-of-options',
        'refs/heads',
      ]);
      const local = yield* Effect.forEach(
        lines(heads),
        (line): Effect.Effect<LocalBranch> => {
          const [name = '', upstream = '', worktree = ''] = line.split('\0');
          return Effect.map(
            worktree === '' ? Effect.succeed(null) : real(worktree),
            (out) => ({
              name,
              upstream: upstream.startsWith('refs/remotes/')
                ? upstream.slice(13)
                : null,
              worktree: out,
            }),
          );
        },
      );
      const remotes = yield* run(path, [
        'for-each-ref',
        '--format=%(refname:lstrip=2)%00%(symref)',
        '--end-of-options',
        'refs/remotes/origin',
      ]);
      const origin = lines(remotes)
        .map((line) => line.split('\0'))
        .filter(([, symref]) => !symref)
        .map(([name = '']) => name);
      const own = worktrees.find((each) => each.path === here);
      return {
        current: own?.branch ?? null,
        worktrees: [
          ...(own ? [own] : []),
          ...worktrees.filter((each) => each !== own),
        ],
        local,
        origin,
      } satisfies GitBranches;
    }),
  ).pipe(Effect.map((found) => found ?? null));

const branchAt = (path: string) =>
  asked(
    Effect.gen(function* () {
      if (!(yield* isTop(path))) return null;
      const head = yield* run(path, ['symbolic-ref', '--quiet', 'HEAD']);
      const ref = head.trim();
      return ref.startsWith('refs/heads/') ? ref.slice(11) : null;
    }),
  ).pipe(Effect.map((found) => found ?? null));

/** Each local branch, with the Origin branch it tracks: `refs/remotes/...` or ''. */
const localBranches = (path: string) =>
  Effect.map(
    run(path, [
      'for-each-ref',
      '--format=%(refname:lstrip=2)%00%(upstream)',
      '--end-of-options',
      'refs/heads',
    ]),
    (output) =>
      new Map(
        lines(output).map((line) => {
          const [name = '', upstream = ''] = line.split('\0');
          return [name, upstream] as const;
        }),
      ),
  );

/**
 * `name` if it is a branch name git takes as it is: never one read as an
 * option, as `--orphan`, or as another, as `@{-1}`.
 */
const branchName = (path: string, name: string) =>
  Effect.gen(function* () {
    const refused = new GitError({ message: `${name} is not a branch name` });
    if (name.startsWith('-')) return yield* refused;
    const checked = yield* run(path, [
      'check-ref-format',
      '--branch',
      name,
    ]).pipe(Effect.mapError(() => refused));
    if (checked.trim() !== name) return yield* refused;
    return name;
  });

const ORIGIN = 'origin/';

/** The branch `name`, just made, and the commit it is on. */
const madeAt = (path: string, name: string) =>
  Effect.map(
    run(path, [
      'rev-parse',
      '--verify',
      '--end-of-options',
      `refs/heads/${name}`,
    ]),
    (at): MadeBranch => ({ name, at: at.trim() }),
  );

const switchTo = (path: string, branch: string) =>
  Effect.gen(function* () {
    const local = yield* localBranches(path);
    if (local.has(branch)) {
      yield* run(path, ['switch', '--end-of-options', branch]);
      return { made: null };
    }
    if (!branch.startsWith(ORIGIN))
      return yield* new GitError({ message: `There is no branch ${branch}` });
    const name = yield* branchName(path, branch.slice(ORIGIN.length));
    const upstream = local.get(name);
    if (upstream === undefined) {
      yield* run(path, [
        'switch',
        '--create',
        name,
        '--track',
        '--end-of-options',
        branch,
      ]);
      return { made: yield* madeAt(path, name) };
    }
    // Another local branch of its name would be different code.
    if (upstream !== `refs/remotes/${branch}`)
      return yield* new GitError({
        message: `The name ${name} is taken by a local branch that does not track ${branch}`,
      });
    yield* run(path, ['switch', '--end-of-options', name]);
    return { made: null };
  });

/** Whether there is anything at `path`. */
const there = (path: string) =>
  Effect.promise(() =>
    stat(path).then(
      () => true,
      () => false,
    ),
  );

/** Removes the Worktree at `at`, and its folder, whatever of them is there. */
const dropWorktree = (path: string, at: string) =>
  Effect.gen(function* () {
    yield* Effect.ignore(
      run(path, ['worktree', 'remove', '--force', '--end-of-options', at]),
    );
    yield* Effect.promise(() =>
      rm(at, { recursive: true, force: true }).catch(() => undefined),
    );
    yield* Effect.ignore(run(path, ['worktree', 'prune']));
  });

/** A branch a failed `worktree add` may have left, made by it just now. */
const forceDropBranch = (path: string, branch: string) =>
  Effect.ignore(run(path, ['branch', '-D', '--end-of-options', branch]));

/**
 * A new Worktree, refused when its branch or its folder is there already:
 * so what a failure leaves of it, git made just now, and it goes.
 */
const addWorktree = (
  path: string,
  { at, branch, from }: Parameters<Git['Service']['addWorktree']>[1],
) =>
  Effect.gen(function* () {
    yield* branchName(path, branch);
    if ((yield* localBranches(path)).has(branch))
      return yield* new GitError({
        message: `The branch ${branch} is there already`,
      });
    if (yield* there(at))
      return yield* new GitError({ message: `${at} is there already` });
    yield* Effect.tryPromise({
      try: () => mkdir(dirname(at), { recursive: true }),
      catch: (error) => new GitError({ message: String(error) }),
    });
    // From an Origin branch too, the new branch tracks nothing until pushed.
    yield* run(path, [
      'worktree',
      'add',
      '--no-track',
      '-b',
      branch,
      '--end-of-options',
      at,
      from,
    ]).pipe(
      Effect.tapError(() =>
        Effect.andThen(dropWorktree(path, at), forceDropBranch(path, branch)),
      ),
    );
    return yield* madeAt(path, branch);
  });

/**
 * A made branch goes only while no Worktree has it out and it is still on
 * the commit it was made on, which `update-ref` checks as it deletes.
 */
const dropBranch = (path: string, { name, at }: MadeBranch) =>
  Effect.gen(function* () {
    const ref = `refs/heads/${name}`;
    const listed = yield* run(path, ['worktree', 'list', '--porcelain']);
    if (lines(listed).includes(`branch ${ref}`)) return;
    yield* run(path, ['update-ref', '-d', ref, at]);
  }).pipe(Effect.ignore);

const pushed = (path: string, branch: string) =>
  Effect.gen(function* () {
    const upstream = yield* run(path, [
      'for-each-ref',
      '--format=%(upstream)',
      '--end-of-options',
      `refs/heads/${branch}`,
    ]);
    if (upstream.trim() !== '') return true;
    const origin = yield* run(path, [
      'for-each-ref',
      '--format=%(refname)',
      '--end-of-options',
      `refs/remotes/origin/${branch}`,
    ]);
    return origin.trim() !== '';
  }).pipe(Effect.orElseSucceed(() => true));

/**
 * The first free name of `to`, `to-2` and on. A name another took between
 * the look and the move, as another program might, is tried again with
 * the next.
 */
const rename = (path: string, from: string, to: string) =>
  Effect.gen(function* () {
    yield* branchName(path, to);
    let local = yield* localBranches(path);
    for (let suffix = 1; suffix <= MOST_SUFFIX; suffix++) {
      const name = suffix === 1 ? to : `${to}-${suffix}`;
      if (local.has(name)) continue;
      const moved = yield* Effect.result(
        run(path, ['branch', '--move', '--end-of-options', from, name]),
      );
      if (moved._tag === 'Success') return name;
      local = yield* localBranches(path);
      if (!local.has(name)) return yield* moved.failure;
    }
    return yield* new GitError({ message: `Every name for ${to} is taken` });
  });

const init = (path: string) =>
  run(path, ['init']).pipe(
    Effect.as(null),
    Effect.catch((error) => Effect.succeed(error.message)),
  );

const make = Effect.gen(function* () {
  const scope = yield* Effect.scope;
  // Git's own renames in one repository trip over each other, and two at
  // once would look for a free name at once: one at a time.
  const renaming = yield* Semaphore.make(1);
  /** The folders a fetch runs in now. */
  const fetching = new Set<string>();
  const fetch = (path: string) =>
    Effect.suspend(() => {
      if (fetching.has(path)) return Effect.void;
      fetching.add(path);
      return run(path, ['fetch', '--prune', 'origin'], FETCH_TIMEOUT).pipe(
        Effect.catch((error) =>
          Effect.logDebug(`No fetch from Origin in ${path}`, error.message),
        ),
        Effect.ensuring(Effect.sync(() => void fetching.delete(path))),
        Effect.forkIn(scope),
        Effect.asVoid,
      );
    });
  return {
    branches,
    branchAt,
    fetch,
    switchTo,
    dropBranch,
    addWorktree,
    removeWorktree: dropWorktree,
    pushed,
    rename: (path, from, to) => renaming.withPermits(1)(rename(path, from, to)),
    init,
  } satisfies Git['Service'];
});

/** Git on PATH; a fetch still running stops with the Layer. */
export const git: Layer.Layer<Git> = Layer.effect(Git, make);
