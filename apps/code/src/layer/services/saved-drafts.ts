import { Clock, Effect, Layer, Schema, type Scope } from 'effect';
import {
  type QueryOptions,
  StdTable,
  type StdTableService,
} from '@kestack/std-toolkit/db';
import { IDB } from '@kestack/std-toolkit/db/idb';
import { Memory } from '@kestack/std-toolkit/db/memory';
import { EntityESchema } from '@kestack/std-toolkit/eschema';
import {
  type Asked,
  type Place,
  SavedDraft,
  SavedDrafts,
  went,
} from '../capabilities/index.ts';
import { keyOf, RETRIES, scan, turns, upsert } from './rows/index.ts';

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
 * 2. Prune   a Project removed or a Machine forgotten, as the user asked:
 *            every row of theirs is deleted, once the saves of it under
 *            way are made, and the saves begun before are made no more. A
 *            list that no longer names them never reaches here (`Asked`).
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

const Json = Schema.fromJsonString(SavedDraft);
const decode = Schema.decodeUnknownEffect(Json);
const encode = Schema.encodeEffect(Json);

const TABLE = 'drafts';
const CONFIRM = 'I KNOW WHAT I AM DOING';

const table = StdTable.make(TABLE).primary('pk', 'sk').build();

const rows = table.entity(DraftSchema).primary().build();

/** A row's id: its Account's, its Machine's and its Session's or Project's. */
const placeOf = (
  accountId: string,
  { machineId, projectId, sessionId }: Place,
) => keyOf(accountId, machineId, sessionId ?? `project:${projectId}`);

/** Whose a row is, as a Gone judges it. */
type Whose = Place & { readonly accountId: string };

const make = (
  layer: Layer.Layer<StdTableService<typeof TABLE>>,
  scope: Scope.Scope,
) => {
  // 1. Save and 2. Prune: in turn for each place, in this Layer's Scope.
  const turn = turns<Whose>(scope);

  // 2. Prune: when each Gone was last dropped, so a save begun before is
  // never made after. One a Project removed or a Machine forgotten, the
  // user's own acts, so it grows only as they are made.
  const dropped = new Map<string, { readonly gone: Asked; at: bigint }>();
  const droppedSince = (whose: Whose, since: bigint) =>
    [...dropped.values()].some(
      ({ gone, at }) => at > since && went(gone)(whose),
    );

  const write = (whose: Whose, id: string, draft: SavedDraft | null) =>
    Effect.gen(function* () {
      if (draft === null) {
        const row = yield* rows.get({ place: id });
        if (row !== null) yield* rows.hardDelete({ place: id }, CONFIRM);
        return;
      }
      const json = yield* encode(draft);
      yield* upsert({
        get: rows.get({ place: id }),
        insert: rows.insert({ place: id, ...whose, draft: json }),
        update: () =>
          rows.getAndUpdate({ place: id }, () => ({ draft: json }), {
            retries: RETRIES,
          }),
      });
    }).pipe(Effect.provide(layer));

  return SavedDrafts.of({
    // After the saves of the place before it, such as a Draft's last as it went.
    read: (accountId, place) => {
      const id = placeOf(accountId, place);
      return turn.run({
        key: id,
        whose: { accountId, ...place },
        does: Effect.flatMap(rows.get({ place: id }), (row) =>
          row === null ? Effect.succeed(null) : decode(row.value.draft),
        ).pipe(
          Effect.provide(layer),
          Effect.orElseSucceed(() => null),
        ),
        skipped: null,
      });
    },
    save: (accountId, place, draft, at, since) => {
      const whose = { accountId, ...place };
      const id = placeOf(accountId, place);
      return turn.run({
        key: id,
        whose,
        does: Effect.suspend(() =>
          droppedSince(whose, since)
            ? Effect.succeed(false)
            : write(whose, id, draft).pipe(
                Effect.as(true),
                Effect.orElseSucceed(() => false),
              ),
        ),
        skipped: false,
        at,
      });
    },
    drop: (gone) =>
      Effect.flatMap(Clock.monotonicTimeNanos, (at) => {
        dropped.set(JSON.stringify(gone), { gone, at });
        return turn.drop(
          went(gone),
          scan((options: QueryOptions<typeof DraftSchema.Type>) =>
            rows.query('primary', { pk: {}, '>=': null }, options),
          ).pipe(
            Effect.flatMap((found) =>
              Effect.forEach(
                found.filter(went(gone)),
                ({ place, accountId, machineId, projectId, sessionId }) =>
                  turn.run({
                    key: place,
                    whose: { accountId, machineId, projectId, sessionId },
                    does: rows
                      .hardDelete({ place }, CONFIRM)
                      .pipe(Effect.provide(layer), Effect.ignore),
                    skipped: undefined,
                  }),
                { discard: true },
              ),
            ),
            Effect.provide(layer),
            Effect.ignore,
          ),
        );
      }),
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
