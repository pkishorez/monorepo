import { Clock, Effect, Fiber, Layer, Schema, Scope } from 'effect';
import type { Entity } from '@kestack/std-toolkit/core';
import {
  type QueryOptions,
  type QueryPage,
  StdTable,
  type StdTableService,
} from '@kestack/std-toolkit/db';
import { IDB } from '@kestack/std-toolkit/db/idb';
import { Memory } from '@kestack/std-toolkit/db/memory';
import { EntityESchema } from '@kestack/std-toolkit/eschema';
import {
  type Gone,
  type Place,
  SavedDraft,
  SavedDrafts,
} from '../capabilities/index.ts';

/*
 * Saved Drafts in this browser's IndexedDB, one database of their own: a
 * row for each place, a Session of a Machine or a Project's new session,
 * of each Account, named by every call. Never synced: the last save wins,
 * whichever tab made it.
 *
 * 1. Save    a save replaces the place's row, or deletes it for nothing.
 *            Saves of a place run one at a time, in this Layer's own
 *            Scope, so one is finished even once its caller goes; one read
 *            before a save already made of the place is dropped.
 * 2. Prune   a Project removed, a Machine forgotten or no longer listed,
 *            an Account signed out: every row of theirs is deleted.
 */

// The Draft is kept as its JSON: an attachment's size is a plain number,
// which an ESchema refuses to keep as a field.
const DraftSchema = EntityESchema.make('SavedDraft', 'place', {
  accountId: Schema.String,
  machineId: Schema.String,
  projectId: Schema.String,
  sessionId: Schema.NullOr(Schema.String),
  draft: Schema.String,
}).build();

type Row = typeof DraftSchema.Type;

const Json = Schema.fromJsonString(SavedDraft);
const decode = Schema.decodeUnknownEffect(Json);
const encode = Schema.encodeEffect(Json);

const TABLE = 'drafts';
const PAGE = 500;
const RETRIES = 5;
const CONFIRM = 'I KNOW WHAT I AM DOING';

const table = StdTable.make(TABLE).primary('pk', 'sk').build();

const rows = table.entity(DraftSchema).primary().build();

/** A row's id: its Account's, its Machine's and its Session's or Project's, which no id holds a space of. */
const placeOf = (
  accountId: string,
  { machineId, projectId, sessionId }: Place,
) => `${accountId} ${machineId} ${sessionId ?? `project:${projectId}`}`;

/** Whether a row, or a place under an Account, went. */
const goneOf =
  (gone: Gone) =>
  (row: Pick<Row, 'accountId' | 'machineId' | 'projectId'>): boolean => {
    switch (gone._tag) {
      case 'Project':
        return (
          row.machineId === gone.machineId && row.projectId === gone.projectId
        );
      case 'Machine':
        return (
          row.accountId === gone.accountId && row.machineId === gone.machineId
        );
      case 'Unlisted':
        return (
          row.accountId === gone.accountId &&
          !gone.listed.includes(row.machineId)
        );
      case 'SignedOut':
        return !gone.signedIn.includes(row.accountId);
    }
  };

const make = (
  layer: Layer.Layer<StdTableService<typeof TABLE>>,
  scope: Scope.Scope,
) => {
  // Every row, to prune by.
  const all = Effect.gen(function* () {
    const found: Array<Row> = [];
    let options: QueryOptions<Row> = { limit: PAGE };
    while (true) {
      const page: QueryPage<Entity<Row>> = yield* rows.query(
        'primary',
        { pk: {}, '>=': null },
        options,
      );
      found.push(...page.items.map(({ value }) => value));
      const last = page.items.at(-1);
      if (!page.hasMore || last === undefined) return found;
      options = { limit: PAGE, after: last };
    }
  });

  // 1. Save: one at a time for each place, and the last read of each.
  const turns = new Map<
    string,
    { tail: Fiber.Fiber<unknown, unknown> | null; last: bigint }
  >();
  const turnOf = (id: string) => {
    const found = turns.get(id);
    if (found !== undefined) return found;
    const made = { tail: null, last: -1n };
    turns.set(id, made);
    return made;
  };
  /**
   * Runs after all of the place already asked for, from the moment it is
   * asked, in the service's own scope, so it finishes even once its caller
   * goes.
   */
  const inTurn = <A>(id: string, effect: Effect.Effect<A>) =>
    Effect.suspend(() => {
      const held = turnOf(id);
      const before = held.tail;
      return Effect.flatMap(
        Effect.forkIn(
          before === null
            ? effect
            : Effect.andThen(Fiber.await(before), effect),
          scope,
        ),
        (fiber) => {
          held.tail = fiber;
          return Fiber.join(fiber);
        },
      );
    });

  const remove = (place: string) =>
    Effect.flatMap(rows.get({ place }), (row) =>
      row === null ? Effect.void : rows.hardDelete({ place }, CONFIRM),
    ).pipe(Effect.provide(layer), Effect.ignore, (removing) =>
      inTurn(place, removing),
    );

  // 2. Prune: what went and when, so a save begun before is never made after.
  const drops: Array<{ readonly gone: Gone; readonly at: bigint }> = [];
  const droppedSince = (accountId: string, place: Place, since: bigint) =>
    drops.some(
      ({ gone, at }) => at > since && goneOf(gone)({ accountId, ...place }),
    );

  const write = (accountId: string, place: Place, draft: SavedDraft | null) => {
    const id = placeOf(accountId, place);
    return Effect.gen(function* () {
      const row = yield* rows.get({ place: id });
      if (draft === null) {
        if (row !== null) yield* rows.hardDelete({ place: id }, CONFIRM);
        return;
      }
      const json = yield* encode(draft);
      if (row === null)
        yield* rows.insert({
          place: id,
          accountId,
          machineId: place.machineId,
          projectId: place.projectId,
          sessionId: place.sessionId,
          draft: json,
        });
      else
        yield* rows.getAndUpdate({ place: id }, () => ({ draft: json }), {
          retries: RETRIES,
        });
    }).pipe(Effect.retry({ times: RETRIES }), Effect.provide(layer));
  };

  return SavedDrafts.of({
    // After the saves of the place before it, such as a Draft's last as it went.
    read: (accountId, place) => {
      const id = placeOf(accountId, place);
      return Effect.flatMap(rows.get({ place: id }), (row) =>
        row === null ? Effect.succeed(null) : decode(row.value.draft),
      ).pipe(
        Effect.provide(layer),
        Effect.orElseSucceed(() => null),
        (reading) => inTurn(id, reading),
      );
    },
    save: (accountId, place, draft, at, since) => {
      const id = placeOf(accountId, place);
      const held = turnOf(id);
      const saving = Effect.suspend(() => {
        if (at < held.last || droppedSince(accountId, place, since))
          return Effect.succeed(false);
        held.last = at;
        return write(accountId, place, draft).pipe(
          Effect.as(true),
          Effect.orElseSucceed(() => false),
        );
      });
      return inTurn(id, saving);
    },
    drop: (gone) =>
      Effect.flatMap(Clock.monotonicTimeNanos, (at) => {
        drops.push({ gone, at });
        return all;
      }).pipe(
        Effect.flatMap((found) =>
          Effect.forEach(
            found.filter(goneOf(gone)),
            ({ place }) => remove(place),
            { discard: true },
          ),
        ),
        Effect.provide(layer),
        Effect.ignore,
      ),
  });
};

/** Saved Drafts in this browser's IndexedDB. */
export const idb = Layer.effect(
  SavedDrafts,
  Effect.map(Effect.scope, (scope) =>
    make(
      IDB.make(table, {
        database: IDB.database({ databaseName: 'code:drafts' }),
        mode: 'disposable',
      }).layer,
      scope,
    ),
  ),
);

/** Saved Drafts in memory, for a test: each Layer built over the same rows. */
export const memory = () => {
  const stored = Memory.make(table).layer;
  return Layer.effect(
    SavedDrafts,
    Effect.map(Effect.scope, (scope) => make(stored, scope)),
  );
};
