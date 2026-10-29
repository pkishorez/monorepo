import { realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { Data, Effect } from 'effect';
import type { Project } from '../records/index.js';
import { BRANCH_PREFIX, Git, type GitError } from './capabilities/index.js';

/*
 * Where a new Session runs, and the git step that puts it there, run
 * before the front door Sends StartSession. In a Project that is not a git
 * repository, or where git is missing or fails to list its branches, it
 * runs in the folder and no step runs. Else, for the branch picked:
 *
 * - a new Worktree  is made in `<worktrees>/<projectId>/<id>`, on the new
 *                   branch `ke-code/<id>` from the branch picked, `<id>`
 *                   the Session's id lower-cased.
 * - otherwise       it runs in the Worktree that has the branch out; with
 *                   none, the Project's folder switches to it first. An
 *                   Origin branch a local one tracks is that local one.
 *
 * Each step is reported as it begins and as it is done. A step that fails
 * is GitFailed, and nothing is changed on its account.
 */

/** The steps of a start, in the order they run. */
export type StartStepName =
  | 'switchingBranch'
  | 'makingWorktree'
  | 'startingAgent';

/** One step of a start, begun or done. */
export interface StartStepReport {
  readonly _tag: 'Step';
  readonly step: StartStepName;
  readonly state: 'running' | 'done';
}

/** Reports each step of a start as it goes. */
export type ReportStep = (step: StartStepReport) => Effect.Effect<void>;

/** A git step of starting a Session failed, so it did not start. */
export class GitFailed extends Data.TaggedError('GitFailed')<{
  readonly step: StartStepName;
  readonly message: string;
}> {}

/** Where a Session runs, and whether its Worktree was made for it. */
export interface Placed {
  /** Null in a Project that is not a git repository. */
  readonly worktree: string | null;
  readonly branch: string | null;
  readonly made: boolean;
}

/** Runs one step: reported begun, run, reported done. */
export const step = <A, E, R>(
  report: ReportStep,
  name: StartStepName,
  effect: Effect.Effect<A, E, R>,
) =>
  Effect.gen(function* () {
    yield* report({ _tag: 'Step', step: name, state: 'running' });
    const done = yield* effect;
    yield* report({ _tag: 'Step', step: name, state: 'done' });
    return done;
  });

const failed = (name: StartStepName) => (error: GitError) =>
  new GitFailed({ step: name, message: error.message });

/** Puts a new Session `id` in place in `project`, on the branch picked. */
export const place = (
  input: {
    readonly project: Project;
    readonly id: string;
    /** Local, or Origin as `origin/main`; null for wherever the folder is. */
    readonly branch: string | null;
    readonly newWorktree: boolean;
    /** The folder every Project's new Worktrees are made in. */
    readonly worktrees: string;
  },
  report: ReportStep,
): Effect.Effect<Placed, GitFailed, Git> =>
  Effect.gen(function* () {
    const git = yield* Git;
    const { project, branch: picked } = input;
    const found = yield* git.branches(project.path);
    if (found === null) return { worktree: null, branch: null, made: false };
    if (input.newWorktree) {
      const id = input.id.toLowerCase();
      const at = join(input.worktrees, project.id, id);
      const branch = `${BRANCH_PREFIX}${id}`;
      yield* step(
        report,
        'makingWorktree',
        git
          .addWorktree(project.path, { at, branch, from: picked ?? 'HEAD' })
          .pipe(
            // Whatever of it git made before it failed goes.
            Effect.tapError(() =>
              git.removeWorktree(project.path, { at, branch }),
            ),
            Effect.mapError(failed('makingWorktree')),
          ),
      );
      const worktree = yield* Effect.promise(() =>
        realpath(at).catch(() => at),
      );
      return { worktree, branch, made: true };
    }
    if (picked === null || picked === found.current)
      return { worktree: project.path, branch: found.current, made: false };
    const local =
      found.local.find((each) => each.name === picked) ??
      found.local.find((each) => each.upstream === picked);
    if (local?.worktree)
      return { worktree: local.worktree, branch: local.name, made: false };
    yield* step(
      report,
      'switchingBranch',
      git
        .switchTo(project.path, local?.name ?? picked)
        .pipe(Effect.mapError(failed('switchingBranch'))),
    );
    return {
      worktree: project.path,
      branch: yield* git.branchAt(project.path),
      made: false,
    };
  });

/** Takes back what `place` made, as when the start fails after it. */
export const unplace = (project: Project, placed: Placed) =>
  placed.made && placed.worktree !== null && placed.branch !== null
    ? Effect.flatMap(Git, (git) =>
        git.removeWorktree(project.path, {
          at: placed.worktree!,
          branch: placed.branch!,
        }),
      )
    : Effect.void;
