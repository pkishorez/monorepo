import { Schema } from 'effect';

/*
 * What a Query keeps: the Instances its rows come from, the rows, each with
 * the key TanStack DB gives it, and where they are. Every change arrives as
 * a Message carrying only the rows added, updated and removed.
 */

/** One row, under its key in the query's result. */
export type Entry<Row> = { readonly id: string | number; readonly row: Row };

export type Model<Row> = {
  /** The names of the Instances the rows come from, as `pocket·acct-42`. */
  readonly keys: ReadonlyArray<string>;
  readonly rows: ReadonlyArray<Entry<Row>>;
  readonly status: 'loading' | 'ready' | 'failed';
  /** What went wrong, once it failed. */
  readonly problem: string | null;
};

export type Message<Row> =
  /** It read its Props anew: the rows it showed are no one's now. */
  | { readonly _tag: 'Opened' }
  | {
      readonly _tag: 'Loaded';
      readonly keys: ReadonlyArray<string>;
      readonly rows: ReadonlyArray<Entry<Row>>;
    }
  | {
      readonly _tag: 'Changed';
      readonly added: ReadonlyArray<Entry<Row>>;
      readonly updated: ReadonlyArray<Entry<Row>>;
      readonly removed: ReadonlyArray<string | number>;
    }
  | { readonly _tag: 'Failed'; readonly message: string };

// Rows are whatever the query selects, so their Schema checks only that
// each sits under its key; the actor's type says what they are.
const Id = Schema.Union([Schema.String, Schema.Number]);
const EntrySchema = Schema.Struct({ id: Id, row: Schema.Unknown });

export const ModelSchema = Schema.Struct({
  keys: Schema.Array(Schema.String),
  rows: Schema.Array(EntrySchema),
  status: Schema.Literals(['loading', 'ready', 'failed']),
  problem: Schema.NullOr(Schema.String),
});

export const MessageSchema = Schema.TaggedUnion({
  Opened: {},
  Loaded: {
    keys: Schema.Array(Schema.String),
    rows: Schema.Array(EntrySchema),
  },
  Changed: {
    added: Schema.Array(EntrySchema),
    updated: Schema.Array(EntrySchema),
    removed: Schema.Array(Id),
  },
  Failed: { message: Schema.String },
});

export const empty: Model<never> = {
  keys: [],
  rows: [],
  status: 'loading',
  problem: null,
};

/** The rows after one change: removed ones gone, updated ones in place, added ones last. */
export const applied = <Row>(
  rows: ReadonlyArray<Entry<Row>>,
  change: Extract<Message<Row>, { readonly _tag: 'Changed' }>,
): ReadonlyArray<Entry<Row>> => {
  const removed = new Set(change.removed);
  const updated = new Map(change.updated.map((entry) => [entry.id, entry]));
  return [
    ...rows.flatMap((entry) =>
      removed.has(entry.id) ? [] : [updated.get(entry.id) ?? entry],
    ),
    ...change.added,
  ];
};
