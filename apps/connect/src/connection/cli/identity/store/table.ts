import { Schema } from 'effect';
import { StdTable } from '@kestack/std-toolkit/db';
import { ESchema } from '@kestack/std-toolkit/eschema';

/*
 * What `ke-connect` keeps of one Connection: the `ke-connect` table in
 * ke-connect.db, persistent, so its setup refuses a change that would leave
 * a kept row unreadable rather than lose who the Connection is. Each row is
 * one of a kind, null until there is one. The Sign-in is beside it in the
 * same file, in auth-toolkit's own table (store.ts).
 */

export const keConnectTable = StdTable.make('ke-connect')
  .primary('pk', 'sk')
  .build();

const KeptConnection = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  /** The User this Connection belongs to. */
  owner: Schema.Struct({ id: Schema.String, email: Schema.String }),
  /** The Connect Cloud it belongs to, its base URL. */
  cloud: Schema.String,
  /** When it last started, epoch ms. */
  startedAt: Schema.Finite,
});
export type KeptConnection = typeof KeptConnection.Type;

const ConnectionSchema = ESchema.make('Connection', {
  /** This Connection; null until the first `serve` makes it, and once it is forgotten. */
  connection: Schema.NullOr(KeptConnection),
}).build();

/** The one Connection this folder is. */
export const connection = keConnectTable
  .singleEntity(ConnectionSchema)
  .default({ connection: null });

const AuthWorkerSchema = ESchema.make('AuthWorker', {
  /** The Auth Worker `cloud`'s `/auth` last named, so a Connection signs in while Connect Cloud cannot be asked; null until it names one. */
  authWorker: Schema.NullOr(
    Schema.Struct({ cloud: Schema.String, url: Schema.String }),
  ),
}).build();

/** The Auth Worker Connect Cloud last named. */
export const authWorker = keConnectTable
  .singleEntity(AuthWorkerSchema)
  .default({ authWorker: null });
