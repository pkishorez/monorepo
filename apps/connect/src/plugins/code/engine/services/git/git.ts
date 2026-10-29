import { execFile } from 'node:child_process';
import { mkdir, realpath, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Duration, Effect, Layer, Option } from 'effect';
import {
  Git,
  GitError,
  type GitBranches,
  type LocalBranch,
  type Worktree,
} from '../../capabilities/index.js';

/*
 * Git, run as the `git` on PATH. Every call has a time limit, asks for no
 * password, and reads git's own words, not the user's language. A question
 * that fails, as with git missing, answers null; a fetch is one per folder
 * at a time, in the background, and its failure only logged.
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

/** The names of every local branch. */
const localNames = (path: string) =>
  Effect.map(
    run(path, ['for-each-ref', '--format=%(refname:lstrip=2)', 'refs/heads']),
    (output) => new Set(lines(output)),
  );

const switchTo = (path: string, branch: string) =>
  Effect.gen(function* () {
    const local = yield* localNames(path);
    if (local.has(branch) || !branch.startsWith('origin/')) {
      yield* run(path, ['switch', branch]);
      return;
    }
    const name = branch.slice('origin/'.length);
    yield* run(
      path,
      local.has(name)
        ? ['switch', name]
        : ['switch', '--create', name, '--track', branch],
    );
  });

const addWorktree = (
  path: string,
  { at, branch, from }: Parameters<Git['Service']['addWorktree']>[1],
) =>
  Effect.gen(function* () {
    yield* Effect.tryPromise({
      try: () => mkdir(dirname(at), { recursive: true }),
      catch: (error) => new GitError({ message: String(error) }),
    });
    // From an Origin branch too, the new branch tracks nothing until pushed.
    yield* run(path, ['worktree', 'add', '--no-track', '-b', branch, at, from]);
  });

const removeWorktree = (
  path: string,
  { at, branch }: Parameters<Git['Service']['removeWorktree']>[1],
) =>
  Effect.gen(function* () {
    yield* Effect.ignore(run(path, ['worktree', 'remove', '--force', at]));
    yield* Effect.promise(() =>
      rm(at, { recursive: true, force: true }).catch(() => undefined),
    );
    yield* Effect.ignore(run(path, ['worktree', 'prune']));
    yield* Effect.ignore(run(path, ['branch', '-D', branch]));
  });

const pushed = (path: string, branch: string) =>
  Effect.gen(function* () {
    const upstream = yield* run(path, [
      'for-each-ref',
      '--format=%(upstream)',
      `refs/heads/${branch}`,
    ]);
    if (upstream.trim() !== '') return true;
    const origin = yield* run(path, [
      'for-each-ref',
      '--format=%(refname)',
      `refs/remotes/origin/${branch}`,
    ]);
    return origin.trim() !== '';
  }).pipe(Effect.orElseSucceed(() => true));

const rename = (path: string, from: string, to: string) =>
  Effect.gen(function* () {
    const local = yield* localNames(path);
    let name = to;
    for (let suffix = 2; local.has(name); suffix++) {
      if (suffix > MOST_SUFFIX)
        return yield* new GitError({
          message: `Every name for ${to} is taken`,
        });
      name = `${to}-${suffix}`;
    }
    yield* run(path, ['branch', '--move', from, name]);
    return name;
  });

const init = (path: string) =>
  run(path, ['init']).pipe(
    Effect.as(null),
    Effect.catch((error) => Effect.succeed(error.message)),
  );

const make = Effect.gen(function* () {
  const scope = yield* Effect.scope;
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
    addWorktree,
    removeWorktree,
    pushed,
    rename,
    init,
  } satisfies Git['Service'];
});

/** Git on PATH; a fetch still running stops with the Layer. */
export const git: Layer.Layer<Git> = Layer.effect(Git, make);
