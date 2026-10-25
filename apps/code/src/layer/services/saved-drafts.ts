import { Effect, Fiber, Layer, Schema, Scope, Semaphore } from 'effect';
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

/** Whether a row went. */
const goneOf =
  (gone: Gone) =>
  (row: Row): boolean => {
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

  const remove = (place: string) =>
    Effect.flatMap(rows.get({ place }), (row) =>
      row === null ? Effect.void : rows.hardDelete({ place }, CONFIRM),
    );

  // 1. Save: one at a time for each place, and the last read of each.
  const turns = new Map<
    string,
    { readonly turn: Semaphore.Semaphore; last: bigint }
  >();
  const turnOf = (id: string) => {
    const found = turns.get(id);
    if (found !== undefined) return found;
    const made = { turn: Semaphore.makeUnsafe(1), last: -1n };
    turns.set(id, made);
    return made;
  };

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
    read: (accountId, place) =>
      Effect.flatMap(rows.get({ place: placeOf(accountId, place) }), (row) =>
        row === null ? Effect.succeed(null) : decode(row.value.draft),
      ).pipe(
        Effect.provide(layer),
        Effect.orElseSucceed(() => null),
      ),
    save: (accountId, place, draft, at) => {
      const held = turnOf(placeOf(accountId, place));
      const saving = Effect.suspend(() => {
        if (at < held.last) return Effect.succeed(false);
        held.last = at;
        return write(accountId, place, draft).pipe(
          Effect.as(true),
          Effect.orElseSucceed(() => false),
        );
      }).pipe(held.turn.withPermit);
      return Effect.flatMap(Effect.forkIn(saving, scope), Fiber.join);
    },
    // 2. Prune
    drop: (gone) =>
      Effect.flatMap(all, (found) =>
        Effect.forEach(
          found.filter(goneOf(gone)),
          ({ place }) => remove(place),
          { discard: true },
        ),
      ).pipe(Effect.provide(layer), Effect.ignore),
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
