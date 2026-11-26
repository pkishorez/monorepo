import { Schema } from 'effect';
import { StdTable } from '@kestack/std-toolkit/db';
import { EntityESchema } from '@kestack/std-toolkit/eschema';

export const ConnectionRecord = EntityESchema.make('Connection', 'id', {
  name: Schema.String,
  version: Schema.String,
  url: Schema.NullOr(Schema.String),
  key: Schema.String,
  userId: Schema.String,
  lastSeen: Schema.Finite,
  signInId: Schema.NullOr(Schema.String),
  removedAt: Schema.NullOr(Schema.Finite),
  displayName: Schema.NullOr(Schema.String),
  choices: Schema.Record(
    Schema.String,
    Schema.Literals(['enabled', 'disabled']),
  ),
}).build();

export type ConnectionRecord = typeof ConnectionRecord.Type;

export const connectionsTable = StdTable.make('connections')
  .primary('pk', 'sk')
  .gsi('GSI1', 'GSI1PK', 'GSI1SK')
  .build();

export const connections = connectionsTable
  .entity(ConnectionRecord)
  .primary({ pk: ['id'] })
  .index('GSI1', 'byOwner', { pk: ['userId'], sk: ['id'] })
  .build();
