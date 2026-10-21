import { Schema } from 'effect';
import { StdTable } from '../../../db/index.js';
import { EntityESchema, ESchema } from '../../../eschema/index.js';

/*
 * How one Instance's space is laid out, as a StdTable: one row per Entity a
 * Collection holds, numbered in the order it was written, and one row per
 * Collection holding the last number given and the Strategy's cursor.
 */

export const SPACE_TABLE = 'replica';

/** JSON the toolkit stores as it is: an encoded Entity, a cursor. */
type Opaque = {} | null;

export const space = StdTable.make(SPACE_TABLE)
  .primary('pk', 'sk')
  .lsi('LSI1', 'LSI1SK')
  .build();

const RecordSchema = EntityESchema.make('ReplicaRecord', 'id', {
  collection: Schema.String,
  /** The order it was written in, among its Collection's records. */
  seq: Schema.String,
  /** The Entity, in encoded form. */
  entity: ESchema.fromType<Opaque>(),
}).build();

export const records = space
  .entity(RecordSchema)
  .primary({ pk: ['collection'] })
  .index('LSI1', 'bySequence', { sk: ['seq'] })
  .build();

const CollectionSchema = EntityESchema.make('ReplicaCollection', 'key', {
  collection: Schema.String,
  /** The last `seq` given in this Collection. */
  position: Schema.String,
  /** The Strategy the cursor belongs to; `null` until one saved it. */
  strategy: Schema.NullOr(Schema.String),
  cursor: ESchema.fromType<Opaque>(),
}).build();

export const collections = space
  .entity(CollectionSchema)
  .primary({ pk: ['collection'] })
  .build();

/** The one row of each Collection, under its own key. */
export const COLLECTION_ROW = 'collection';

const SEQUENCE_WIDTH = 16;

/** A Collection's position before its first record. */
export const START = '0'.padStart(SEQUENCE_WIDTH, '0');

/** The `seq` after `position`, as fixed-width text so it sorts. */
export const nextSequence = (position: string): string =>
  (Number(position) + 1).toString().padStart(SEQUENCE_WIDTH, '0');
