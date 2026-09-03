import { Schema } from 'effect';
import { EntityESchema, fromType } from '../../../eschema/index.js';
import { syncStore, type OpaqueValue } from './table.js';

export const outboxEntryStatus = Schema.Literals([
  'pending',
  'in-flight',
  'failed',
]);

export const outboxEntityBody = Schema.Struct({
  kind: Schema.Literal('entity'),
  op: Schema.Literals(['insert', 'update', 'delete']),
  key: Schema.String,
  base: Schema.Unknown,
  after: Schema.Unknown,
  changed: Schema.Array(Schema.String),
});

export const outboxActionBody = Schema.Struct({
  kind: Schema.Literal('action'),
  payload: Schema.Unknown,
});

export const outboxEntryBody = Schema.Union([
  outboxEntityBody,
  outboxActionBody,
]);

const storedOutboxEntrySchema = EntityESchema.make(
  'SyncStoredOutboxEntry',
  'key',
  {
    sync: Schema.String,
    name: Schema.String,
    queue: Schema.String,
    status: outboxEntryStatus,
    enqueuedAt: Schema.String,
    body: fromType<OpaqueValue>(),
  },
).build();

export const storedOutboxEntryEntity = syncStore
  .entity(storedOutboxEntrySchema)
  .primary({ pk: ['sync'] })
  .index('LSI1', 'byQueue', { sk: ['queue'] })
  .build();

export type StoredOutboxEntryValue = typeof storedOutboxEntrySchema.Type;
