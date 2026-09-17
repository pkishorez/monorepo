import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/unstable/rpc';
import { EntrySchema } from '../journal/index.js';

export class FlowRpcError extends Schema.TaggedError<FlowRpcError>(
  'FlowRpcError',
)('FlowRpcError', { message: Schema.String }) {}

/** A Flow Store cursor over the store's own monotonic write stamp. */
export const FlowCursorSchema = Schema.Union([
  Schema.Struct({ '>': Schema.NullOr(Schema.String) }),
  Schema.Struct({ '>=': Schema.NullOr(Schema.String) }),
  Schema.Struct({ '<': Schema.NullOr(Schema.String) }),
  Schema.Struct({ '<=': Schema.NullOr(Schema.String) }),
]);

export const StoredEntrySchema = Schema.Struct({
  entry: EntrySchema,
  /** The write stamp the Flow Store assigned; strictly increasing per store. */
  _u: Schema.String,
});

export const WriteFlowEntriesResultSchema = Schema.Struct({
  accepted: Schema.Number,
  rejected: Schema.Number,
});

export const ListFlowEntriesResultSchema = Schema.Struct({
  items: Schema.Array(StoredEntrySchema),
});

export const ClearFlowsResultSchema = Schema.Struct({
  deleted: Schema.Number,
});

export type FlowCursor = typeof FlowCursorSchema.Type;
export type StoredEntry = typeof StoredEntrySchema.Type;

/** The contract between a process (or a browser) and a Flow Store. */
export const FlowRpc = RpcGroup.make(
  Rpc.make('WriteFlowEntries', {
    payload: { entries: Schema.Array(EntrySchema) },
    success: WriteFlowEntriesResultSchema,
    error: FlowRpcError,
  }),
  Rpc.make('ListFlowEntries', {
    payload: { _u: FlowCursorSchema, limit: Schema.optional(Schema.Number) },
    success: ListFlowEntriesResultSchema,
    error: FlowRpcError,
  }),
  Rpc.make('ClearFlows', {
    payload: {},
    success: ClearFlowsResultSchema,
    error: FlowRpcError,
  }),
);
