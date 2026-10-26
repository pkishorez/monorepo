import { Effect } from 'effect';
import { DEV_PREFIX, connectionName } from './auth.js';

/*
 * The development Connections whose branch has no checkout any more. Each
 * branch's are `dev-<branch>` and `dev-<branch>-real`; a `dev-` Connection
 * that is neither for any branch `git worktree list` shows is gone, and is
 * removed as `ke-connect remove` removes one: forgotten in its Cloud
 * Connect when that still answers, its folders deleted either way. When
 * the branches cannot be listed, nothing is removed.
 */

/** The development Connections among `names` that belong to none of the branches `slugs`. */
export const goneOf = (
  names: ReadonlyArray<string>,
  slugs: ReadonlySet<string>,
): ReadonlyArray<string> => {
  const kept = new Set(
    [...slugs].flatMap((slug) =>
      (['fake', 'real'] as const).map((auth) => connectionName(slug, auth)),
    ),
  );
  return names
    .filter((name) => name.startsWith(DEV_PREFIX) && !kept.has(name))
    .sort();
};

export interface Gone {
  /** Every branch with a checkout, by its slug; fails when they cannot be listed. */
  readonly slugs: Effect.Effect<ReadonlySet<string>, unknown>;
  /** Every Connection on this computer. */
  readonly names: () => ReadonlyArray<string>;
  /** Removes one, as `ke-connect remove` does: whether it did. */
  readonly remove: (name: string) => Effect.Effect<boolean>;
}

/** Removes every development Connection whose branch is gone, one at a time: the names removed. */
export const removeGone = ({ slugs, names, remove }: Gone) =>
  Effect.gen(function* () {
    const listed = yield* Effect.result(slugs);
    if (listed._tag === 'Failure') {
      yield* Effect.logWarning(
        'Could not list the branches with a checkout; no development Connection is removed',
        listed.failure,
      );
      return [];
    }
    const removed: Array<string> = [];
    for (const name of goneOf(names(), listed.success)) {
      yield* Effect.log(
        `Removing ${name}: its branch has no checkout any more`,
      );
      if (yield* remove(name)) removed.push(name);
      else yield* Effect.logWarning(`Could not remove ${name}`);
    }
    return removed;
  });
