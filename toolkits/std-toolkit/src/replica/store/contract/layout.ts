import { Schema } from 'effect';
import { StdTable } from '../../../db/index.js';
import { EntityESchema, ESchema } from '../../../eschema/index.js';

/*
 * How one Instance's space is laid out, as a StdTable: one row per Entity a
 * Collection holds, numbered in the order it was written and naming the
 * Window it is in; one row per Collection holding the last number given
 * and how many times Windows were pruned from it; one row per Strategy
 * scope, the whole Collection or one Window, holding its cursor; one row
 * per participant naming the Windows it has open; and one row of the
 * scopes the Leader last told are Caught Up.
 */

export const SPACE_TABLE = 'replica';

/** JSON the toolkit stores as it is: an encoded Entity, a cursor. */
type Opaque = {} | null;

/** What a Window's field reads. */
export const WindowValue = Schema.Union([
  Schema.String,
  Schema.Number,
  Schema.Boolean,
]);

export type WindowValue = typeof WindowValue.Type;

/** The whole Collection's scope. */
export const WHOLE = 'strategy';

/** A Strategy's scope: the whole Collection's, or one Window's, as `walletId="7"`. */
export const scopeOf = (
  window: { readonly path: string; readonly value: WindowValue } | null,
) =>
  window === null ? WHOLE : `${window.path}=${JSON.stringify(window.value)}`;

/** The Window of a record in none: its Collection syncs whole, or by more than one field. */
export const OUTSIDE = '';

/** The Window of a record kept before records named theirs, until its Instance names it. */
export const UNNAMED = '?';

export const space = StdTable.make(SPACE_TABLE)
  .primary('pk', 'sk')
  .lsi('LSI1', 'LSI1SK')
  .lsi('LSI2', 'LSI2SK')
  .build();

const RecordSchema = EntityESchema.make('ReplicaRecord', 'id', {
  collection: Schema.String,
  /** The order it was written in, among its Collection's records. */
  seq: Schema.String,
  /** The Entity, in encoded form. */
  entity: ESchema.fromType<Opaque>(),
})
  .evolve(
    'v2',
    {
      /** The scope of the Window it is in, `OUTSIDE` if none. */
      window: Schema.String,
    },
    (prev) => ({ ...prev, window: UNNAMED }),
  )
  .build();

export const records = space
  .entity(RecordSchema)
  .primary({ pk: ['collection'] })
  .index('LSI1', 'bySequence', { sk: ['seq'] })
  .index('LSI2', 'byWindow', { sk: ['window'] })
  .build();

const CollectionSchema = EntityESchema.make('ReplicaCollection', 'key', {
  collection: Schema.String,
  /** The last `seq` given in this Collection. */
  position: Schema.String,
})
  .evolve(
    'v2',
    {
      /** Raised each time Windows are pruned from it, so every reader reads it afresh. */
      generation: Schema.Finite,
    },
    (prev) => ({ ...prev, generation: 0 }),
  )
  .build();

export const collections = space
  .entity(CollectionSchema)
  .primary({ pk: ['collection'] })
  .build();

/** The one row of each Collection, under its own key. */
export const COLLECTION_ROW = 'collection';

/** Its id is the scope: the whole Collection, or one Window of it. */
const CursorSchema = EntityESchema.make('ReplicaCursor', 'scope', {
  collection: Schema.String,
  /** The Strategy the cursor belongs to. */
  strategy: Schema.String,
  cursor: ESchema.fromType<Opaque>(),
}).build();

export const cursors = space
  .entity(CursorSchema)
  .primary({ pk: ['collection'] })
  .build();

const OpeningSchema = EntityESchema.make('ReplicaOpening', 'participant', {
  /** Always `opening`: every participant's row sits in one partition. */
  kind: Schema.String,
  /** Its open Windows: `{ collection, path, value }` each. */
  windows: ESchema.fromType<Opaque>(),
}).build();

export const openings = space
  .entity(OpeningSchema)
  .primary({ pk: ['kind'] })
  .build();

export const OPENING = 'opening';

const ToldSchema = EntityESchema.make('ReplicaTold', 'of', {
  /** Always `told`, as its id is always `leader`: there is one row. */
  kind: Schema.String,
  /** The scopes Caught Up, by Worker key, as `entries/wallet="w1"`. */
  scopes: ESchema.fromType<Opaque>(),
}).build();

export const told = space
  .entity(ToldSchema)
  .primary({ pk: ['kind'] })
  .build();

export const TOLD = { kind: 'told', of: 'leader' } as const;

const SEQUENCE_WIDTH = 16;

/** A Collection's position before its first record. */
export const START = '0'.padStart(SEQUENCE_WIDTH, '0');

/** The `seq` after `position`, as fixed-width text so it sorts. */
export const nextSequence = (position: string): string =>
  (Number(position) + 1).toString().padStart(SEQUENCE_WIDTH, '0');
