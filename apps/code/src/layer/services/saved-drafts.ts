import { Effect, Layer, Schema } from 'effect';
import { Accounts } from '@kestack/auth-toolkit/client';
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
import { type Place, SavedDraft, SavedDrafts } from '../capabilities/index.ts';

/*
 * Saved Drafts in this browser's IndexedDB, one database of their own: a
 * row for each place, a Session of a Machine or a Project's new session,
 * of each Account. A place's own reads and writes are for the Account
 * signed in, read at each call; with nobody signed in nothing is read or
 * kept. Never synced: the last write wins, whichever tab made it.
 *
 * 1. Keep    a write replaces the place's row, or makes it; a clear
 *            deletes it.
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

const make = (
  layer: Layer.Layer<StdTableService<typeof TABLE>>,
  accounts: Accounts['Service'],
) => {
  const signedIn = Effect.map(accounts.current, (state) =>
    state._tag === 'SignedIn' ? state.active.id : null,
  );

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

  // 2. Prune
  const prune = (gone: (row: Row) => boolean) =>
    Effect.flatMap(all, (found) =>
      Effect.forEach(found.filter(gone), ({ place }) => remove(place), {
        discard: true,
      }),
    ).pipe(Effect.provide(layer), Effect.ignore);

  return SavedDrafts.of({
    read: (place) =>
      Effect.gen(function* () {
        const accountId = yield* signedIn;
        if (accountId === null) return null;
        const row = yield* rows.get({ place: placeOf(accountId, place) });
        return row === null ? null : yield* decode(row.value.draft);
      }).pipe(
        Effect.provide(layer),
        Effect.orElseSucceed(() => null),
      ),
    // 1. Keep
    write: (place, draft) =>
      Effect.gen(function* () {
        const accountId = yield* signedIn;
        if (accountId === null) return;
        const id = placeOf(accountId, place);
        const json = yield* encode(draft);
        const row = yield* rows.get({ place: id });
        if (row === null)
          return yield* rows.insert({
            place: id,
            accountId,
            machineId: place.machineId,
            projectId: place.projectId,
            sessionId: place.sessionId,
            draft: json,
          });
        return yield* rows.getAndUpdate(
          { place: id },
          () => ({ draft: json }),
          {
            retries: RETRIES,
          },
        );
      }).pipe(
        Effect.retry({ times: RETRIES }),
        Effect.provide(layer),
        Effect.ignore,
      ),
    clear: (place) =>
      Effect.flatMap(signedIn, (accountId) =>
        accountId === null ? Effect.void : remove(placeOf(accountId, place)),
      ).pipe(Effect.provide(layer), Effect.ignore),
    dropProject: (machineId, projectId) =>
      Effect.flatMap(signedIn, (accountId) =>
        prune(
          (row) =>
            row.accountId === accountId &&
            row.machineId === machineId &&
            row.projectId === projectId,
        ),
      ),
    dropMachine: (accountId, machineId) =>
      prune(
        (row) => row.accountId === accountId && row.machineId === machineId,
      ),
    keepMachines: (accountId, machineIds) =>
      prune(
        (row) =>
          row.accountId === accountId && !machineIds.includes(row.machineId),
      ),
    keepAccounts: (accountIds) =>
      prune((row) => !accountIds.includes(row.accountId)),
  });
};

/** Saved Drafts in this browser's IndexedDB. */
export const idb = Layer.effect(
  SavedDrafts,
  Effect.map(Accounts, (accounts) =>
    make(
      IDB.make(table, {
        database: IDB.database({ databaseName: 'code:drafts' }),
        mode: 'disposable',
      }).layer,
      accounts,
    ),
  ),
);

/** Saved Drafts in memory, for a test. */
export const memory = () => {
  const store = Memory.make(table).layer;
  return Layer.effect(
    SavedDrafts,
    Effect.map(Accounts, (accounts) => make(store, accounts)),
  );
};
