import { Effect, Layer, Option, Semaphore } from 'effect';
import {
  FileSystem,
  Git,
  GitError,
  type AccessDenied,
  type GitBranches,
  type IoError,
  type LocalBranch,
  type MadeBranch,
  type NotFound,
  type Worktree,
} from '../../../capabilities/index.js';
import { basename, dirname, join } from '../../../paths/index.js';
import {
  branchOfHead,
  configText,
  parseConfig,
  type GitConfig,
} from '../../file-system/fake/index.js';

/*
 * Git as the File System fake keeps it: no `git` to run, only `.git` in
 * the tree, laid out as file-system/fake/git.ts says, read and written
 * through the File System key as git reads and writes its own files. Every
 * answer is what git would give on that layout. Its state is the disk's,
 * so it keeps none of its own: the File System fake's sample project lays
 * it out, and Code's own steps change it. A fetch copies
 * Origin's `refs/heads` into `refs/remotes/origin`, dropping what Origin
 * no longer has. A new Worktree is made as git makes one, with the
 * repository's files copied from its main Worktree: the fake keeps no
 * commits to check out. Browser-safe: nothing here imports Node.
 */

/** Where one Worktree's git state is. */
interface Repo {
  /** The Worktree's top, its symlinks resolved. */
  readonly top: string;
  /** Its own git folder, where its HEAD is: `<repo>/.git`, or `<repo>/.git/worktrees/<id>`. */
  readonly gitDir: string;
  /** The repository's git folder: its refs, config and Worktrees. */
  readonly common: string;
}

/** A Worktree, with the git folder its HEAD is in. */
interface Listed extends Worktree {
  readonly gitDir: string;
}

const NOT_A_REPOSITORY =
  'fatal: not a git repository (or any of the parent directories): .git';

/** The most `-2`, `-3` and on a rename tries before it gives up. */
const MOST_SUFFIX = 100;

const ORIGIN = 'origin/';

const decoder = new TextDecoder();

const byName = (a: { name: string }, b: { name: string }) =>
  a.name < b.name ? -1 : a.name > b.name ? 1 : 0;

/** A File System failure, as git would say it. */
const gitFailed = (error: NotFound | AccessDenied | IoError) =>
  new GitError({
    message:
      error._tag === 'NotFound'
        ? `fatal: ${error.path}: No such file or directory`
        : error._tag === 'AccessDenied'
          ? `fatal: ${error.path}: Permission denied`
          : error.message,
  });

/** A question's answer; null when git failed. */
const asked = <A>(effect: Effect.Effect<A, GitError>) =>
  Effect.orElseSucceed(effect, () => null);

/**
 * Whether `name` is a branch name git takes as it is, as `git
 * check-ref-format --branch` does: never one read as an option, or as
 * another ref, as `@{-1}` or `HEAD~1`.
 */
const isBranchName = (name: string) =>
  name !== '' &&
  name !== '@' &&
  name !== 'HEAD' &&
  !name.startsWith('-') &&
  !name.startsWith('/') &&
  !name.endsWith('/') &&
  !name.endsWith('.') &&
  !name.includes('..') &&
  !name.includes('//') &&
  !name.includes('@{') &&
  // oxlint-disable-next-line no-control-regex -- git refuses control characters
  !/[\u0000- \u007f~^:?*[\\]/.test(name) &&
  name
    .split('/')
    .every((part) => !part.startsWith('.') && !part.endsWith('.lock'));

const branchName = (name: string) =>
  isBranchName(name)
    ? Effect.succeed(name)
    : Effect.fail(new GitError({ message: `${name} is not a branch name` }));

const make = Effect.gen(function* () {
  const files = yield* FileSystem;
  const scope = yield* Effect.scope;
  // Renames in one repository look for a free name: one at a time.
  const renaming = yield* Semaphore.make(1);
  /** The folders a fetch runs in now. */
  const fetching = new Set<string>();

  const there = (path: string) =>
    Effect.match(files.stat(path), {
      onFailure: () => false,
      onSuccess: () => true,
    });

  /** The text of the file at `path`; null when it cannot be read. */
  const textAt = (path: string) =>
    files.readFile(path).pipe(
      Effect.map((bytes) => decoder.decode(bytes)),
      Effect.orElseSucceed(() => null),
    );

  /** Writes the file at `path`, the folders on the way made. */
  const write = (path: string, text: string) =>
    files.mkdir(dirname(path), { recursive: true }).pipe(
      Effect.andThen(files.writeFile(path, text)),
      Effect.mapError((error) =>
        error._tag === 'AlreadyExists'
          ? new GitError({ message: `fatal: ${error.path} is not a folder` })
          : gitFailed(error),
      ),
    );

  const removed = (path: string) =>
    files
      .remove(path, { recursive: true, force: true })
      .pipe(Effect.mapError(gitFailed));

  /** The git folders `.git` at `dotGit` stands for: a folder, or a linked Worktree's file. */
  const gitDirsOf = (dotGit: string) =>
    Effect.gen(function* () {
      const found = yield* Effect.option(files.stat(dotGit));
      if (Option.isNone(found)) return null;
      if (found.value.kind === 'folder')
        return (yield* textAt(join(dotGit, 'HEAD'))) === null
          ? null
          : { gitDir: dotGit, common: dotGit };
      const pointer = /^gitdir: (.+)$/m.exec((yield* textAt(dotGit)) ?? '');
      if (!pointer?.[1]) return null;
      const named = pointer[1].trim();
      const gitDir = named.startsWith('/')
        ? join(named)
        : join(dirname(dotGit), named);
      if ((yield* textAt(join(gitDir, 'HEAD'))) === null) return null;
      const common = (yield* textAt(join(gitDir, 'commondir')))?.trim();
      return {
        gitDir,
        common: !common
          ? gitDir
          : common.startsWith('/')
            ? join(common)
            : join(gitDir, common),
      };
    });

  /** The Worktree the folder `path` is in, as `git rev-parse` finds it. */
  const repoAt = (path: string) =>
    Effect.gen(function* () {
      const real = yield* files.realpath(path).pipe(
        Effect.mapError(
          () =>
            new GitError({
              message: `fatal: cannot change to '${path}': No such file or directory`,
            }),
        ),
      );
      const found = yield* Effect.option(files.stat(real));
      if (Option.isSome(found) && found.value.kind === 'folder')
        for (let at = real; ; at = dirname(at)) {
          const dirs = yield* gitDirsOf(join(at, '.git'));
          if (dirs !== null) return { top: at, ...dirs } satisfies Repo;
          if (at === '/') break;
        }
      return yield* new GitError({ message: NOT_A_REPOSITORY });
    });

  /** Every ref file under `folder`, by its name from there, name-sorted. */
  const refsIn = (
    folder: string,
    prefix = '',
  ): Effect.Effect<Array<{ readonly name: string; readonly value: string }>> =>
    Effect.gen(function* () {
      const entries = yield* files
        .list(folder)
        .pipe(Effect.orElseSucceed(() => []));
      const found: Array<{ readonly name: string; readonly value: string }> =
        [];
      for (const entry of entries) {
        const name = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
        const path = join(folder, entry.name);
        if (entry.kind === 'folder') found.push(...(yield* refsIn(path, name)));
        else if (entry.kind === 'file') {
          const value = yield* textAt(path);
          if (value !== null) found.push({ name, value: value.trim() });
        }
      }
      return found.sort(byName);
    });

  /** Each local branch, to the commit it is on. */
  const headsOf = (repo: Repo) =>
    Effect.map(
      refsIn(join(repo.common, 'refs/heads')),
      (refs) => new Map(refs.map(({ name, value }) => [name, value] as const)),
    );

  /** Each Origin branch the last fetch saw, by its name on Origin, to its commit. */
  const remotesOf = (repo: Repo) =>
    Effect.map(
      refsIn(join(repo.common, 'refs/remotes/origin')),
      (refs) =>
        new Map(
          refs
            .filter(({ value }) => !value.startsWith('ref:'))
            .map(({ name, value }) => [name, value] as const),
        ),
    );

  const configOf = (repo: Repo) =>
    Effect.map(textAt(join(repo.common, 'config')), (text) =>
      parseConfig(text ?? ''),
    );

  const writeConfig = (repo: Repo, config: GitConfig) =>
    write(join(repo.common, 'config'), configText(config));

  /** Every Worktree that is there, the main one first. */
  const worktreesOf = (repo: Repo) =>
    Effect.gen(function* () {
      const real = (path: string) =>
        files.realpath(path).pipe(Effect.orElseSucceed(() => path));
      const head = (gitDir: string) =>
        Effect.map(textAt(join(gitDir, 'HEAD')), (text) =>
          branchOfHead(text ?? ''),
        );
      const found: Array<Listed> = [
        {
          path: yield* real(dirname(repo.common)),
          branch: yield* head(repo.common),
          gitDir: repo.common,
        },
      ];
      const linked = join(repo.common, 'worktrees');
      for (const entry of yield* files
        .list(linked)
        .pipe(Effect.orElseSucceed(() => []))) {
        if (entry.kind !== 'folder') continue;
        const gitDir = join(linked, entry.name);
        const dotGit = (yield* textAt(join(gitDir, 'gitdir')))?.trim();
        // Prunable: its folder is gone.
        if (!dotGit || !(yield* there(dotGit))) continue;
        found.push({
          path: yield* real(dirname(dotGit)),
          branch: yield* head(gitDir),
          gitDir,
        });
      }
      return found;
    });

  /** The commit `name` is: `HEAD`, a local branch, or an Origin one. */
  const commitOf = (
    repo: Repo,
    heads: ReadonlyMap<string, string>,
    name: string,
  ) =>
    Effect.gen(function* () {
      let found: string | undefined;
      if (name === 'HEAD') {
        const head = ((yield* textAt(join(repo.gitDir, 'HEAD'))) ?? '').trim();
        const branch = branchOfHead(head);
        found =
          branch === null
            ? /^[0-9a-f]{40}$/.test(head)
              ? head
              : undefined
            : heads.get(branch);
      } else if (!name.startsWith('-'))
        found =
          heads.get(name) ??
          (name.startsWith(ORIGIN)
            ? (yield* remotesOf(repo)).get(name.slice(ORIGIN.length))
            : undefined);
      if (found === undefined)
        return yield* new GitError({
          message: `fatal: invalid reference: ${name}`,
        });
      return found;
    });

  const branches = (path: string) =>
    asked(
      Effect.gen(function* () {
        const repo = yield* repoAt(path);
        const worktrees = yield* worktreesOf(repo);
        const config = yield* configOf(repo);
        const local = [...(yield* headsOf(repo)).keys()].map(
          (name): LocalBranch => ({
            name,
            upstream: config.upstreams[name] ?? null,
            worktree:
              worktrees.find((each) => each.branch === name)?.path ?? null,
          }),
        );
        const origin = [...(yield* remotesOf(repo)).keys()].map(
          (name) => `${ORIGIN}${name}`,
        );
        const own = worktrees.find((each) => each.path === repo.top);
        const shown = (each: Listed): Worktree => ({
          path: each.path,
          branch: each.branch,
        });
        return {
          current: own?.branch ?? null,
          worktrees: [
            ...(own ? [own] : []),
            ...worktrees.filter((each) => each !== own),
          ].map(shown),
          local,
          origin,
        } satisfies GitBranches;
      }),
    );

  const branchAt = (path: string) =>
    asked(
      Effect.gen(function* () {
        const repo = yield* repoAt(path);
        return branchOfHead((yield* textAt(join(repo.gitDir, 'HEAD'))) ?? '');
      }),
    );

  /** Origin's branches copied into `refs/remotes/origin`, those it dropped gone. */
  const fetchNow = (path: string) =>
    Effect.gen(function* () {
      const repo = yield* repoAt(path);
      const { origin } = yield* configOf(repo);
      const unreachable = new GitError({
        message: `fatal: '${origin ?? 'origin'}' does not appear to be a git repository`,
      });
      if (origin === null || !origin.startsWith('/')) return yield* unreachable;
      if ((yield* textAt(join(origin, 'HEAD'))) === null)
        return yield* unreachable;
      const theirs = yield* refsIn(join(origin, 'refs/heads'));
      const seen = yield* remotesOf(repo);
      const remotes = join(repo.common, 'refs/remotes/origin');
      for (const { name, value } of theirs)
        if (seen.get(name) !== value)
          yield* write(join(remotes, name), `${value}\n`);
      const kept = new Set(theirs.map(({ name }) => name));
      for (const name of seen.keys())
        if (!kept.has(name)) yield* removed(join(remotes, name));
    });

  const fetch = (path: string) =>
    Effect.suspend(() => {
      if (fetching.has(path)) return Effect.void;
      fetching.add(path);
      return fetchNow(path).pipe(
        Effect.catch((error) =>
          Effect.logDebug(`No fetch from Origin in ${path}`, error.message),
        ),
        Effect.ensuring(Effect.sync(() => void fetching.delete(path))),
        Effect.forkIn(scope),
        Effect.asVoid,
      );
    });

  const switchTo = (path: string, branch: string) =>
    Effect.gen(function* () {
      const repo = yield* repoAt(path);
      const heads = yield* headsOf(repo);
      const config = yield* configOf(repo);
      const worktrees = yield* worktreesOf(repo);
      const switchHere = (name: string) =>
        Effect.gen(function* () {
          const elsewhere = worktrees.find(
            (each) => each.branch === name && each.path !== repo.top,
          );
          if (elsewhere)
            return yield* new GitError({
              message: `fatal: '${name}' is already used by worktree at '${elsewhere.path}'`,
            });
          yield* write(join(repo.gitDir, 'HEAD'), `ref: refs/heads/${name}\n`);
        });
      if (heads.has(branch)) {
        yield* switchHere(branch);
        return { made: null };
      }
      if (!branch.startsWith(ORIGIN))
        return yield* new GitError({ message: `There is no branch ${branch}` });
      const name = yield* branchName(branch.slice(ORIGIN.length));
      if (!heads.has(name)) {
        const at = (yield* remotesOf(repo)).get(name);
        if (at === undefined)
          return yield* new GitError({
            message: `fatal: '${branch}' is not a commit and a branch '${name}' cannot be created from it`,
          });
        yield* write(join(repo.common, 'refs/heads', name), `${at}\n`);
        yield* writeConfig(repo, {
          ...config,
          upstreams: { ...config.upstreams, [name]: branch },
        });
        yield* write(join(repo.gitDir, 'HEAD'), `ref: refs/heads/${name}\n`);
        return { made: { name, at } };
      }
      // Another local branch of its name would be different code.
      if (config.upstreams[name] !== branch)
        return yield* new GitError({
          message: `The name ${name} is taken by a local branch that does not track ${branch}`,
        });
      yield* switchHere(name);
      return { made: null };
    });

  /**
   * Copies the folder `from` into `to`, all but `.git` and `to` itself;
   * what cannot be read is left out.
   */
  const copy = (
    from: string,
    to: string,
    root = to,
  ): Effect.Effect<void, GitError> =>
    Effect.gen(function* () {
      for (const entry of yield* files
        .list(from)
        .pipe(Effect.orElseSucceed(() => []))) {
        const source = join(from, entry.name);
        if (entry.name === '.git' || source === root) continue;
        const target = join(to, entry.name);
        if (entry.kind === 'folder') {
          yield* files.mkdir(target).pipe(
            Effect.catchTag('AlreadyExists', () => Effect.void),
            Effect.mapError(gitFailed),
          );
          yield* copy(source, target, root);
        } else if (entry.kind === 'file') {
          const bytes = yield* Effect.option(files.readFile(source));
          if (Option.isSome(bytes))
            yield* files
              .writeFile(target, bytes.value)
              .pipe(Effect.mapError(gitFailed));
        }
      }
    });

  /** Takes away the Worktree at `at`, and any whose folder is gone. */
  const dropWorktree = (path: string, at: string) =>
    Effect.gen(function* () {
      yield* Effect.ignore(removed(at));
      const repo = yield* repoAt(path);
      const linked = join(repo.common, 'worktrees');
      for (const entry of yield* files
        .list(linked)
        .pipe(Effect.orElseSucceed(() => []))) {
        const gitDir = join(linked, entry.name);
        const dotGit = (yield* textAt(join(gitDir, 'gitdir')))?.trim();
        if (!dotGit || !(yield* there(dotGit)))
          yield* Effect.ignore(removed(gitDir));
      }
    }).pipe(Effect.ignore);

  const addWorktree = (
    path: string,
    worktree: Parameters<Git['Service']['addWorktree']>[1],
  ) =>
    Effect.gen(function* () {
      const at = join(worktree.at);
      const { branch, from } = worktree;
      const repo = yield* repoAt(path);
      yield* branchName(branch);
      const heads = yield* headsOf(repo);
      if (heads.has(branch))
        return yield* new GitError({
          message: `The branch ${branch} is there already`,
        });
      if (yield* there(at))
        return yield* new GitError({ message: `${at} is there already` });
      const commit = yield* commitOf(repo, heads, from);
      const linked = join(repo.common, 'worktrees');
      let id = basename(at);
      for (let suffix = 1; yield* there(join(linked, id)); suffix++)
        id = `${basename(at)}${suffix}`;
      const gitDir = join(linked, id);
      yield* Effect.gen(function* () {
        // From an Origin branch too, the new branch tracks nothing until pushed.
        yield* write(join(repo.common, 'refs/heads', branch), `${commit}\n`);
        yield* write(join(gitDir, 'HEAD'), `ref: refs/heads/${branch}\n`);
        yield* write(join(gitDir, 'commondir'), '../..\n');
        yield* write(join(gitDir, 'gitdir'), `${join(at, '.git')}\n`);
        yield* files
          .mkdir(at, { recursive: true })
          .pipe(
            Effect.mapError((error) =>
              error._tag === 'AlreadyExists'
                ? new GitError({ message: `${at} is there already` })
                : gitFailed(error),
            ),
          );
        yield* copy(dirname(repo.common), at);
        yield* write(join(at, '.git'), `gitdir: ${gitDir}\n`);
      }).pipe(
        Effect.tapError(() =>
          Effect.andThen(
            dropWorktree(path, at),
            Effect.ignore(removed(join(repo.common, 'refs/heads', branch))),
          ),
        ),
      );
      return { name: branch, at: commit } satisfies MadeBranch;
    });

  /**
   * A made branch goes only while no Worktree has it out and it is still
   * on the commit it was made on.
   */
  const dropBranch = (path: string, { name, at }: MadeBranch) =>
    Effect.gen(function* () {
      const repo = yield* repoAt(path);
      const worktrees = yield* worktreesOf(repo);
      if (worktrees.some((each) => each.branch === name)) return;
      if ((yield* headsOf(repo)).get(name) !== at) return;
      yield* removed(join(repo.common, 'refs/heads', name));
    }).pipe(Effect.ignore);

  const pushed = (path: string, branch: string) =>
    Effect.gen(function* () {
      const repo = yield* repoAt(path);
      const config = yield* configOf(repo);
      if ((yield* headsOf(repo)).has(branch) && config.upstreams[branch])
        return true;
      return (yield* remotesOf(repo)).has(branch);
    }).pipe(Effect.orElseSucceed(() => true));

  /** The first free name of `to`, `to-2` and on. */
  const rename = (path: string, from: string, to: string) =>
    Effect.gen(function* () {
      const repo = yield* repoAt(path);
      yield* branchName(to);
      const heads = yield* headsOf(repo);
      const at = heads.get(from);
      if (at === undefined)
        return yield* new GitError({
          message: `error: refname refs/heads/${from} not found`,
        });
      for (let suffix = 1; suffix <= MOST_SUFFIX; suffix++) {
        const name = suffix === 1 ? to : `${to}-${suffix}`;
        if (heads.has(name)) continue;
        yield* write(join(repo.common, 'refs/heads', name), `${at}\n`);
        yield* removed(join(repo.common, 'refs/heads', from));
        for (const each of yield* worktreesOf(repo))
          if (each.branch === from)
            yield* write(
              join(each.gitDir, 'HEAD'),
              `ref: refs/heads/${name}\n`,
            );
        const config = yield* configOf(repo);
        const upstream = config.upstreams[from];
        if (upstream !== undefined) {
          const rest = Object.entries(config.upstreams).filter(
            ([branch]) => branch !== from,
          );
          yield* writeConfig(repo, {
            ...config,
            upstreams: { ...Object.fromEntries(rest), [name]: upstream },
          });
        }
        return name;
      }
      return yield* new GitError({ message: `Every name for ${to} is taken` });
    });

  return {
    top: (path) => asked(Effect.map(repoAt(path), (repo) => repo.top)),
    branches,
    branchAt,
    fetch,
    switchTo,
    addWorktree,
    removeWorktree: dropWorktree,
    dropBranch,
    pushed,
    rename: (path, from, to) => renaming.withPermits(1)(rename(path, from, to)),
  } satisfies Git['Service'];
});

/** Git over the File System, as its fake keeps `.git`; a fetch still running stops with the Layer. */
export const fakeGit: Layer.Layer<Git, never, FileSystem> = Layer.effect(
  Git,
  make,
);
