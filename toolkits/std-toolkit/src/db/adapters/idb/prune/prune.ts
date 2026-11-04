import { Effect, Exit } from 'effect';

/*
 * Deletes the IndexedDB databases under a prefix that are not kept. The
 * caller says what it keeps, never what it drops, so a database renamed or
 * no longer used goes without anyone naming it. Nothing outside the prefix
 * is touched.
 *
 * Names are read as segments split by `:`, so one rule serves every level:
 * `replica:` keeping Account ids deletes every other Account's databases,
 * and `replica:acc_1:` keeping Instance names deletes the rest of that
 * Account's.
 */

export interface IDBPruneOptions {
  /** Where to look: every database whose name starts with it. Never empty. */
  readonly prefix: string;
  /** What to keep: the segment right after the prefix, up to the next `:`. */
  readonly keep: ReadonlyArray<string>;
  readonly indexedDB?: IDBFactory;
}

const SEPARATOR = ':';

/** The segment of `name` right after `prefix`, up to the next `:`. */
const segmentAfter = (prefix: string, name: string) => {
  const rest = name.slice(prefix.length);
  const at = rest.indexOf(SEPARATOR);
  return at === -1 ? rest : rest.slice(0, at);
};

// Open connections close themselves on the version change a delete raises,
// so the request completes rather than staying blocked.
const deleteDatabase = (factory: IDBFactory, name: string) =>
  Effect.callback<void, unknown>((resume) => {
    const request = factory.deleteDatabase(name);
    request.onsuccess = () => resume(Effect.void);
    request.onerror = () => resume(Effect.fail(request.error));
  });

/**
 * Deletes every database under `prefix` whose next segment is not in
 * `keep`, and answers the names it deleted.
 */
export const prune = (
  options: IDBPruneOptions,
): Effect.Effect<ReadonlyArray<string>, unknown> =>
  Effect.gen(function* () {
    const { prefix } = options;
    if (prefix === '')
      return yield* Effect.fail(
        new Error('IDB.prune needs a prefix: it never deletes everything'),
      );
    const factory = options.indexedDB ?? globalThis.indexedDB;
    if (factory === undefined)
      return yield* Effect.fail(
        new Error('IndexedDB is not available in this environment'),
      );
    const kept = new Set(options.keep);
    const databases = yield* Effect.tryPromise({
      try: () => factory.databases(),
      catch: (cause) => cause,
    });
    const pruned = databases.flatMap(({ name }) =>
      name !== undefined &&
      name.startsWith(prefix) &&
      !kept.has(segmentAfter(prefix, name))
        ? [name]
        : [],
    );
    // One that cannot be deleted does not keep the rest: each is tried, and
    // the first failure is answered once all have been.
    const exits = yield* Effect.forEach(pruned, (name) =>
      Effect.exit(deleteDatabase(factory, name)),
    );
    const failure = exits.find(Exit.isFailure);
    if (failure !== undefined) return yield* Effect.failCause(failure.cause);
    return pruned;
  });
