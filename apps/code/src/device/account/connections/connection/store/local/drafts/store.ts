import { Clock, Effect, Layer, Schema, type Scope } from 'effect';
import {
  type QueryOptions,
  StdTable,
  type StdTableService,
} from '@kestack/std-toolkit/db';
import { IDB } from '@kestack/std-toolkit/db/idb';
import { Memory } from '@kestack/std-toolkit/db/memory';
import { EntityESchema } from '@kestack/std-toolkit/eschema';
import { connection } from '../../../../store.ts';
import {
  type Gone,
  keyOf,
  placed,
  RETRIES,
  scan,
  turns,
  upsert,
  went,
} from '../../../../../store/rows/index.ts';
import { type Place, SavedDraft, SavedDrafts } from './drafts.ts';

/*
 * Saved Drafts in this browser's IndexedDB, local storage in the `drafts`
 * table of each Connection's database, `code:account:<accountId>:connection:<connectionId>`:
 * a row for each place, a Session or a Project's new session, so they go
 * with their Connection, and with its Account. Never synced: the last save
 * wins, whichever tab made it.
 *
 * 1. Save    a save replaces the place's row, or deletes it for nothing.
 *            Saves of a place run one at a time, in this Layer's own
 *            Scope, so one is finished even once its caller goes; one read
 *            before a save already made of the place is dropped.
 * 2. Prune   a Project removed or a Connection forgotten, as the user asked:
 *            the saves of it under way are made, and those begun before
 *            are made no more; a Project's rows are deleted, a Connection's
 *            go with its database (`Storage`).
 */

// The Draft is kept as its JSON: an attachment's size is a plain number,
// which an ESchema refuses to keep as a field.
const DraftSchema = EntityESchema.make('SavedDraft', 'place', {
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

/** A row's id in its Connection's table: its Session's, or its Project's. */
const placeOf = ({ projectId, sessionId }: Place) =>
  sessionId ?? `project:${projectId}`;

/** Whose a row is, as a Gone judges it. */
type Whose = Place & { readonly accountId: string };

/** A row's turn: its Connection's database and its id. */
const turnOf = (whose: Whose) =>
  keyOf(connection(whose.accountId, whose.connectionId), placeOf(whose));

const make = (
  layerOf: (database: string) => Layer.Layer<StdTableService<typeof TABLE>>,
  scope: Scope.Scope,
) => {
  // 1. Save and 2. Prune: in turn for each place, in this Layer's Scope.
  const turn = turns<Whose>(scope);

  // 2. Prune: when each Gone was last dropped, so a save begun before is
  // never made after. One a Project removed or a Connection forgotten, the
  // user's own acts, so it grows only as they are made.
  const dropped = new Map<string, { readonly gone: Gone; at: bigint }>();
  const droppedSince = (whose: Whose, since: bigint) =>
    [...dropped.values()].some(
      ({ gone, at }) => at > since && went(gone)(whose),
    );

  const write = (whose: Whose, draft: SavedDraft | null) => {
    const id = placeOf(whose);
    return Effect.gen(function* () {
      if (draft === null) {
        const row = yield* rows.get({ place: id });
        if (row !== null) yield* rows.hardDelete({ place: id }, CONFIRM);
        return;
      }
      const json = yield* encode(draft);
      yield* upsert({
        get: rows.get({ place: id }),
        insert: rows.insert({
          place: id,
          projectId: whose.projectId,
          sessionId: whose.sessionId,
          draft: json,
        }),
        update: () =>
          rows.getAndUpdate({ place: id }, () => ({ draft: json }), {
            retries: RETRIES,
          }),
      });
    }).pipe(
      Effect.provide(layerOf(connection(whose.accountId, whose.connectionId))),
    );
  };

  return SavedDrafts.of({
    // After the saves of the place before it, such as a Draft's last as it went.
    read: (accountId, place) => {
      const whose = { accountId, ...place };
      return turn.run({
        key: turnOf(whose),
        whose,
        does: Effect.flatMap(rows.get({ place: placeOf(place) }), (row) =>
          row === null ? Effect.succeed(null) : decode(row.value.draft),
        ).pipe(
          Effect.provide(layerOf(connection(accountId, place.connectionId))),
          Effect.orElseSucceed(() => null),
        ),
        skipped: null,
      });
    },
    save: (accountId, place, draft, at, since) => {
      const whose = { accountId, ...place };
      return turn.run({
        key: turnOf(whose),
        whose,
        does: Effect.suspend(() =>
          droppedSince(whose, since)
            ? Effect.succeed(false)
            : write(whose, draft).pipe(
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
        const { accountId, connectionId } = gone;
        const layer = layerOf(connection(accountId, connectionId));
        return turn.drop(
          went(gone),
          gone._tag === 'Connection'
            ? Effect.void
            : scan((options: QueryOptions<typeof DraftSchema.Type>) =>
                rows.query('primary', { pk: {}, '>=': null }, options),
              ).pipe(
                Effect.flatMap((found) =>
                  Effect.forEach(
                    found.filter(
                      ({ projectId }) => projectId === gone.projectId,
                    ),
                    ({ place, projectId, sessionId }) =>
                      turn.run({
                        key: turnOf({
                          accountId,
                          connectionId,
                          projectId,
                          sessionId,
                        }),
                        whose: {
                          accountId,
                          connectionId,
                          projectId,
                          sessionId,
                        },
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

/** Saved Drafts in this browser's IndexedDB, each Connection's in its own database. */
export const idb = Layer.effect(
  SavedDrafts,
  Effect.map(Effect.scope, (scope) =>
    make(
      placed(
        (database) =>
          IDB.make(table, {
            database: IDB.database({ databaseName: database }),
            mode: 'disposable',
          }).layer,
      ),
      scope,
    ),
  ),
);

/** Saved Drafts in memory, for a test: each Layer built over the same rows. */
export const memory = () => {
  const layerOf = placed(() => Memory.make(table).layer);
  return Layer.effect(
    SavedDrafts,
    Effect.map(Effect.scope, (scope) => make(layerOf, scope)),
  );
};
