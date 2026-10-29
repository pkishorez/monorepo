import { basename } from 'node:path';
import { Duration, Effect } from 'effect';
import { BRANCH_PREFIX, Git } from '../../capabilities/index.js';
import type { SessionSelf } from './actor.js';

/*
 * The branch a Session's Worktree is on, which the user may change there
 * at any time.
 *
 * 1. The Branch Check reads it as the Session starts, then every minute,
 *    and Sends BranchFound when it changed. Git missing or failing reads
 *    as on no branch.
 * 2. On the first Title, a Worktree made for the Session, still on its
 *    branch `ke-code/<its folder's name>` and never pushed, has that
 *    branch renamed for the Title, `ke-code/<title-in-words>`, with `-2`,
 *    `-3` and on when that is taken; BranchFound says so at once.
 */

export const EVERY = Duration.minutes(1);

/** How long a rename may take before the branch stays as it is. */
const RENAME_TIMEOUT = Duration.seconds(20);

/** The longest a Title's part of a branch name is. */
const MOST_SLUG = 48;

/** A Title as part of a branch name: lower-case words joined by dashes. */
export const slugOf = (title: string) =>
  title
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .slice(0, MOST_SLUG)
    .replace(/-+$/, '');

/** The Branch Check: Sends BranchFound each time the branch is not as kept. */
export const followBranch = (self: SessionSelf) =>
  Effect.gen(function* () {
    const git = yield* Git;
    while (true) {
      const { model } = yield* self.get;
      const branch = yield* git.branchAt(model.cwd);
      if (branch !== model.session.branch)
        yield* self.send({ _tag: 'BranchFound', branch });
      yield* Effect.sleep(EVERY);
    }
  });

/** Renames a new Worktree's branch for the Session's first Title. */
export const renameFor = (self: SessionSelf, title: string) =>
  Effect.gen(function* () {
    const { model } = yield* self.get;
    const { worktree } = model.session;
    const slug = slugOf(title);
    if (worktree === null || slug === '') return;
    const git = yield* Git;
    const from = `${BRANCH_PREFIX}${basename(worktree)}`;
    if ((yield* git.branchAt(worktree)) !== from) return;
    if (yield* git.pushed(worktree, from)) return;
    const branch = yield* git.rename(worktree, from, `${BRANCH_PREFIX}${slug}`);
    yield* self.send({ _tag: 'BranchFound', branch });
  }).pipe(
    Effect.timeout(RENAME_TIMEOUT),
    Effect.catch((error) =>
      Effect.logWarning('The branch keeps its name', error),
    ),
  );
