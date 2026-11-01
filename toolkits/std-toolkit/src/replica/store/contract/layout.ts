import { Schema } from 'effect';
import { StdTable } from '../../../db/index.js';
import { EntityESchema, ESchema } from '../../../eschema/index.js';

/*
 * How one Instance's space is laid out, as a StdTable: one row per Entity a
 * Collection holds, numbered in the order it was written; one row per
 * Collection holding the last number given; one row per Strategy scope, the
 * whole Collection or one Window, holding its cursor; one row per
 * participant naming the Windows it has open; and one row of the scopes the
 * Leader last told are Caught Up.
 */

export const SPACE_TABLE = 'replica';

/** JSON the toolkit stores as it is: an encoded Entity, a cursor. */
type Opaque = {} | null;

const RecordSchema = EntityESchema.make('ReplicaRecord', 'id', {
  collection: Schema.String,
  /** The order it was written in, among its Collection's records. */
  seq: Schema.String,
  /** The Entity, in encoded form. */
  entity: ESchema.fromType<Opaque>(),
}).build();

const CollectionSchema = EntityESchema.make('ReplicaCollection', 'key', {
  collection: Schema.String,
  /** The last `seq` given in this Collection. */
  position: Schema.String,
}).build();

/** The one row of each Collection, under its own key. */
export const COLLECTION_ROW = 'collection';

/** Its id is the scope: the whole Collection, or one Window of it. */
const CursorSchema = EntityESchema.make('ReplicaCursor', 'scope', {
  collection: Schema.String,
  /** The Strategy the cursor belongs to. */
  strategy: Schema.String,
  cursor: ESchema.fromType<Opaque>(),
}).build();

const OpeningSchema = EntityESchema.make('ReplicaOpening', 'participant', {
  /** Always `opening`: every participant's row sits in one partition. */
  kind: Schema.String,
  /** Its open Windows: `{ collection, path, value }` each. */
  windows: ESchema.fromType<Opaque>(),
}).build();

export const OPENING = 'opening';

const ToldSchema = EntityESchema.make('ReplicaTold', 'of', {
  /** Always `told`, as its id is always `leader`: there is one row. */
  kind: Schema.String,
  /** The scopes Caught Up, by Worker key, as `entries/wallet="w1"`. */
  scopes: ESchema.fromType<Opaque>(),
}).build();

export const TOLD = { kind: 'told', of: 'leader' } as const;

export const space = StdTable.make(SPACE_TABLE)
  .primary('pk', 'sk')
  .lsi('LSI1', 'LSI1SK')
  .entity(RecordSchema, (e) =>
    e
      .primary({ pk: ['collection'] })
      .index('LSI1', 'bySequence', { sk: ['seq'] }),
  )
  .entity(CollectionSchema, (e) => e.primary({ pk: ['collection'] }))
  .entity(CursorSchema, (e) => e.primary({ pk: ['collection'] }))
  .entity(OpeningSchema, (e) => e.primary({ pk: ['kind'] }))
  .entity(ToldSchema, (e) => e.primary({ pk: ['kind'] }))
  .build();

export const records = space.ReplicaRecord;
export const collections = space.ReplicaCollection;
export const cursors = space.ReplicaCursor;
export const openings = space.ReplicaOpening;
export const told = space.ReplicaTold;

const SEQUENCE_WIDTH = 16;

/** A Collection's position before its first record. */
export const START = '0'.padStart(SEQUENCE_WIDTH, '0');

/** The `seq` after `position`, as fixed-width text so it sorts. */
export const nextSequence = (position: string): string =>
  (Number(position) + 1).toString().padStart(SEQUENCE_WIDTH, '0');
