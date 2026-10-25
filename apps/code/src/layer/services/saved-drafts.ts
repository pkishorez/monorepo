import { Effect, Layer, Schema, Semaphore } from 'effect';
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
 * of each Account, named by every call. Never synced: the last write
 * wins, whichever tab made it.
 *
 * 1. Keep    a write changes the place's row from what it holds, one at a
 *            time for each place in this tab, and counts its revision; a
 *            change to nothing deletes it.
 * 2. Prune   a Project removed, a Machine forgotten or no longer listed,
 *            an Account signed out: every row of theirs is deleted.
 */

// The Draft is kept as its JSON: an attachment's size is a plain number,
// which an ESchema refuses to keep as a field, and so is the revision.
const DraftSchema = EntityESchema.make('SavedDraft', 'place', {
  accountId: Schema.String,
  machineId: Schema.String,
  projectId: Schema.String,
  sessionId: Schema.NullOr(Schema.String),
  draft: Schema.String,
  revision: Schema.String,
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

const keptOf = (row: Row) =>
  Effect.map(decode(row.draft), (draft) => ({
    draft,
    revision: Number(row.revision),
  }));

const make = (layer: Layer.Layer<StdTableService<typeof TABLE>>) => {
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

  // 1. Keep: one write at a time for each place.
  const turns = new Map<string, Semaphore.Semaphore>();
  const turnOf = (id: string) => {
    const found = turns.get(id);
    if (found !== undefined) return found;
    const made = Semaphore.makeUnsafe(1);
    turns.set(id, made);
    return made;
  };

  return SavedDrafts.of({
    read: (accountId, place) =>
      Effect.flatMap(rows.get({ place: placeOf(accountId, place) }), (row) =>
        row === null ? Effect.succeed(null) : keptOf(row.value),
      ).pipe(
        Effect.provide(layer),
        Effect.orElseSucceed(() => null),
      ),
    write: (accountId, place, change) => {
      const id = placeOf(accountId, place);
      return Effect.gen(function* () {
        const row = yield* rows.get({ place: id });
        const kept =
          row === null
            ? null
            : yield* keptOf(row.value).pipe(Effect.orElseSucceed(() => null));
        const draft = change(kept);
        if (kept !== null && draft === kept.draft) return kept.revision;
        if (draft === null) {
          if (row !== null) yield* rows.hardDelete({ place: id }, CONFIRM);
          return null;
        }
        const revision = (kept?.revision ?? 0) + 1;
        const json = yield* encode(draft);
        if (row === null)
          yield* rows.insert({
            place: id,
            accountId,
            machineId: place.machineId,
            projectId: place.projectId,
            sessionId: place.sessionId,
            draft: json,
            revision: String(revision),
          });
        else
          yield* rows.getAndUpdate(
            { place: id },
            () => ({ draft: json, revision: String(revision) }),
            { retries: RETRIES },
          );
        return revision;
      }).pipe(
        Effect.retry({ times: RETRIES }),
        Effect.provide(layer),
        Effect.orElseSucceed(() => null),
        turnOf(id).withPermit,
      );
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
export const idb = Layer.sync(SavedDrafts, () =>
  make(
    IDB.make(table, {
      database: IDB.database({ databaseName: 'code:drafts' }),
      mode: 'disposable',
    }).layer,
  ),
);

/** Saved Drafts in memory, for a test. */
export const memory = () =>
  Layer.succeed(SavedDrafts, make(Memory.make(table).layer));
