import type { Collection } from '@tanstack/db';
import {
  Clock,
  Deferred,
  Effect,
  Queue,
  Semaphore,
  Stream,
  SubscriptionRef,
} from 'effect';
import type { Scope } from 'effect';
import { ReplicaError, type AnyShape } from '../../shape/index.js';
import type { Space, Wire, Written } from '../../store/contract/index.js';
import {
  reader,
  showCollections,
  type Read,
  type Reading,
} from './collections.js';
import type { Message } from './model.js';
import { scopeOf, workerKey, type WindowAt } from './windows.js';

/*
 * One Instance, open on this participant: its space in the Store and the
 * Collections that show it. Everything that reaches the Store goes through
 * here, so the Collections never show what the Store does not hold.
 *
 * 1. Load     the space into the Collections before anyone reads them.
 * 2. Refresh  what changed since, in the order it was written: after this
 *             participant writes, and each time the Doorbell rings.
 * 3. Keep     what a Strategy read or the Backend confirmed: checked
 *             against the ESchemas, written to the Store, then shown.
 * 4. Say      what its own work tells the Instance actor: Actions under
 *             way, and Windows a Query opened and let go of.
 * 5. Hear     which scopes the Instance actor says are Caught Up, for the
 *             Queries that read them.
 * 6. Recall   whether each scope a Query reads was ever synced here: a
 *             cursor in the Store says so, and Caught Up from then on.
 */

/** What a Query, a Worker or an Action holds of a running Instance. */
export interface Live {
  readonly name: string;
  readonly key: unknown;
  readonly collections: Readonly<Record<string, Collection<object, string>>>;
  /** Puts what the Backend returned in the Store, in place of the Optimistic Changes it answers. */
  readonly confirm: (
    entities: ReadonlyArray<Wire>,
  ) => Effect.Effect<void, ReplicaError>;
  /** Waits until the Instance stops: its Collections no longer follow the Store. */
  readonly stopped: Effect.Effect<void>;
  /** Counts an Action as under way on this Instance until the Scope closes. */
  readonly track: (action: string) => Effect.Effect<void, never, Scope.Scope>;
  /**
   * Whether every Collection and Window read is Caught Up, now and each time
   * that changes. A Collection waits on its whole Strategy, if it has one;
   * one with none waits on nothing.
   */
  readonly caughtUp: (
    reads: ReadonlyArray<Omit<Reading, 'instance'>>,
  ) => Stream.Stream<boolean>;
  /**
   * Whether no Collection or Window read is Never Synced: false at first if
   * one is, then true once it is Caught Up. It waits on what `caughtUp`
   * waits on, and ends once true.
   */
  readonly synced: (
    reads: ReadonlyArray<Omit<Reading, 'instance'>>,
  ) => Stream.Stream<boolean>;
}

export interface Opened {
  readonly live: Live;
  readonly space: Space;
  readonly refresh: Effect.Effect<void, ReplicaError>;
  /** What a Strategy read for one Collection: checked, and kept with its scope's cursor. */
  readonly keep: (
    collection: string,
    entities: ReadonlyArray<Wire>,
    cursor: NonNullable<Written['cursor']>,
  ) => Effect.Effect<'kept' | 'outdated', ReplicaError>;
  /** The Messages the Instance's own work sends it: Actions beginning and ending, Windows opening and let go. */
  readonly messages: Stream.Stream<Message>;
  /** The scopes Caught Up now, by Worker key, as the Instance actor's Model says. */
  readonly report: (caughtUp: ReadonlyArray<string>) => Effect.Effect<void>;
}

const warn = (name: string, read: ReadonlyArray<Read>) =>
  Effect.forEach(
    read,
    (each) =>
      each._tag === 'Outdated'
        ? Effect.logWarning(
            `[@kestack/std-toolkit/replica] ${name}: an Entity at version ${each.version} is newer than this app knows; it is left out until the app updates`,
          )
        : each._tag === 'Invalid'
          ? Effect.logWarning(
              `[@kestack/std-toolkit/replica] ${name}: an Entity does not match its ESchema and is left out: ${each.message}`,
            )
          : Effect.void,
    { discard: true },
  );

/** What the Instance's own work says, before a let-go Window is stamped with the time. */
type Said =
  | Message
  | {
      readonly _tag: 'LetGo';
      readonly collection: string;
      readonly window: WindowAt;
    };

export const openInstance = (
  shape: AnyShape,
  key: unknown,
  space: Space,
  /** The fields each Collection with Windows opens them on. */
  windowPaths: Readonly<Record<string, ReadonlyArray<string>>>,
  /** The Collections with a Strategy for all of it. */
  whole: ReadonlySet<string>,
): Effect.Effect<Opened, ReplicaError, Scope.Scope> =>
  Effect.gen(function* () {
    const { name } = space;
    const readers = Object.fromEntries(
      Object.entries(shape.collections).map(([collection, schema]) => [
        collection,
        reader(schema),
      ]),
    );
    const byEntity = new Map(
      Object.entries(shape.collections).map(([collection, schema]) => [
        schema.name,
        collection,
      ]),
    );
    const said = yield* Queue.unbounded<Said>();
    const shown = showCollections(
      shape,
      name,
      Object.fromEntries(
        Object.entries(windowPaths).map(([collection, paths]) => [
          collection,
          {
            paths,
            open: (window: WindowAt) =>
              Queue.offerUnsafe(said, {
                _tag: 'WindowOpened',
                collection,
                ...window,
              }),
            release: (window: WindowAt) =>
              Queue.offerUnsafe(said, { _tag: 'LetGo', collection, window }),
          },
        ]),
      ),
    );
    const positions = new Map<string, string>();
    const reading = yield* Semaphore.make(1);
    const stopped = yield* Deferred.make<void>();
    yield* Effect.addFinalizer(() =>
      Effect.andThen(Deferred.succeed(stopped, undefined), shown.cleanup),
    );

    // 2. Refresh
    const refresh = reading.withPermit(
      Effect.forEach(
        Object.keys(shape.collections),
        (collection) =>
          Effect.gen(function* () {
            const after = positions.get(collection) ?? null;
            const { records, position } = yield* space.read(collection, after);
            const read = records.map(readers[collection]!);
            yield* warn(name, read);
            shown.show(collection, read);
            positions.set(collection, position);
          }),
        { discard: true },
      ),
    );

    // 1. Load
    yield* refresh;

    // 3. Keep
    const write = (written: ReadonlyArray<Written>) =>
      Effect.andThen(space.write(written), refresh);

    const keep: Opened['keep'] = (collection, entities, cursor) =>
      Effect.gen(function* () {
        const read = entities.map(readers[collection]!);
        yield* warn(name, read);
        // Neither the records nor the cursor move past an Entity this app
        // cannot read: newer code reads it again after a reload.
        if (read.some((each) => each._tag === 'Outdated')) return 'outdated';
        const records = read.flatMap((each) =>
          each._tag === 'Read' ? [{ id: each.id, entity: each.entity }] : [],
        );
        yield* write([{ collection, records, cursor }]);
        return 'kept';
      });

    const confirm: Live['confirm'] = (entities) =>
      Effect.gen(function* () {
        if (yield* Deferred.isDone(stopped))
          return yield* new ReplicaError({
            message: `Instance ${name} has stopped, so it cannot confirm what the Backend returned`,
          });
        const parts = new Map<string, Written['records'][number][]>();
        for (const entity of entities) {
          const collection = byEntity.get(entity.meta._e);
          if (collection === undefined)
            return yield* new ReplicaError({
              message: `Instance ${name} has no Collection of "${entity.meta._e}"`,
            });
          const read = readers[collection]!(entity);
          if (read._tag !== 'Read')
            return yield* new ReplicaError({
              message:
                read._tag === 'Outdated'
                  ? `The Backend returned "${entity.meta._e}" at version ${read.version}, newer than this app knows`
                  : `The Backend returned a "${entity.meta._e}" that does not match its ESchema: ${read.message}`,
            });
          parts.set(collection, [
            ...(parts.get(collection) ?? []),
            { id: read.id, entity },
          ]);
        }
        yield* write(
          [...parts].map(([collection, records]) => ({ collection, records })),
        );
      });

    // 4. Say
    const track: Live['track'] = (action) =>
      Effect.acquireRelease(
        Queue.offer(said, { _tag: 'ActionBegan', action }),
        () => Queue.offer(said, { _tag: 'ActionEnded', action }),
      ).pipe(Effect.asVoid);

    // 5. Hear
    const reported = yield* SubscriptionRef.make<ReadonlySet<string>>(
      new Set(),
    );
    /** The scopes a query's reads wait on: a Window, or a Collection's whole Strategy. */
    const scopesOf = (reads: ReadonlyArray<Omit<Reading, 'instance'>>) => [
      ...new Map(
        reads.flatMap(({ collection, window }) =>
          window !== null || whole.has(collection)
            ? [[workerKey(collection, window), { collection, window }] as const]
            : [],
        ),
      ),
    ];
    const caughtUp: Live['caughtUp'] = (reads) => {
      const needed = scopesOf(reads).map(([key]) => key);
      return SubscriptionRef.changes(reported).pipe(
        Stream.map((scopes) => needed.every((key) => scopes.has(key))),
        Stream.changes,
      );
    };
    const report: Opened['report'] = (scopes) =>
      SubscriptionRef.set(reported, new Set(scopes));

    // 6. Recall: a scope's first answer saves its cursor, so one saved is
    // one synced here once, in this tab or another, before or since.
    const synced: Live['synced'] = (reads) =>
      Stream.unwrap(
        Effect.forEach(scopesOf(reads), ([, { collection, window }]) =>
          space.cursor(collection, scopeOf(window)),
        ).pipe(
          Effect.map((cursors) => cursors.every((cursor) => cursor !== null)),
          // A Store that cannot say has not shown it synced.
          Effect.orElseSucceed(() => false),
          Effect.map((saved) =>
            saved
              ? Stream.succeed(true)
              : Stream.concat(
                  Stream.succeed(false),
                  caughtUp(reads).pipe(Stream.filter(Boolean), Stream.take(1)),
                ),
          ),
        ),
      );

    const messages = Stream.fromQueue(said).pipe(
      Stream.mapEffect((each): Effect.Effect<Message> =>
        each._tag === 'LetGo'
          ? Effect.map(Clock.currentTimeMillis, (at) => ({
              _tag: 'WindowReleased',
              collection: each.collection,
              ...each.window,
              at,
            }))
          : Effect.succeed(each),
      ),
    );

    return {
      live: {
        name,
        key,
        collections: shown.collections,
        confirm,
        stopped: Deferred.await(stopped),
        track,
        caughtUp,
        synced,
      },
      space,
      refresh,
      keep,
      messages,
      report,
    };
  });
