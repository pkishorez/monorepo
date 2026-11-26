import { Schema } from 'effect';
import { StdTable } from '@kestack/std-toolkit/db';
import { ESchema } from '@kestack/std-toolkit/eschema';

export const keConnectTable = StdTable.make('ke-connect')
  .primary('pk', 'sk')
  .build();

const KeptConnection = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  owner: Schema.Struct({ id: Schema.String, email: Schema.String }),
  cloud: Schema.String,
  startedAt: Schema.Finite,
});

const ConnectionSchema = ESchema.make('Connection', {
  connection: Schema.NullOr(KeptConnection),
}).build();

export const connection = keConnectTable
  .singleEntity(ConnectionSchema)
  .default({ connection: null });

const AuthWorkerSchema = ESchema.make('AuthWorker', {
  authWorker: Schema.NullOr(
    Schema.Struct({ cloud: Schema.String, url: Schema.String }),
  ),
}).build();

export const authWorker = keConnectTable
  .singleEntity(AuthWorkerSchema)
  .default({ authWorker: null });
