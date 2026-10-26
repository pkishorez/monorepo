import { Schema } from 'effect';
import { StdTable } from '@kestack/std-toolkit/db';
import { EntityESchema } from '@kestack/std-toolkit/eschema';

/*
 * Where Cloud Connect keeps its records: one std Table, `connections`,
 * on Cloud Connect's D1 database. A Connection id is one Connection's alone, across
 * every User, so each Connection is its own partition, keyed by its id; its
 * owner's Connections are found through `byOwner`. A forgotten Connection stays
 * as a tombstone, with `forgottenAt` set and the Sign-in it last reported
 * with (ADR 0016).
 */

/**
 * One Connection as stored: its last Report (see `ConnectionReport`), its owner,
 * Last Seen, and whether it was forgotten. Its own fields, not the
 * contract's, so a change to the contract never silently changes the rows.
 * v1 kept the address and the last Tunnel Check apart; v2 keeps the status
 * they make, and a v1 row with no address reads as Opening.
 */
export const ConnectionRecord = EntityESchema.make('Connection', 'id', {
  name: Schema.String,
  url: Schema.NullOr(Schema.String),
  key: Schema.String,
  version: Schema.String,
  tunnel: Schema.NullOr(
    Schema.Struct({
      ok: Schema.Boolean,
      at: Schema.Finite,
      problem: Schema.NullOr(Schema.String),
    }),
  ),
  /** The User it reports as. */
  userId: Schema.String,
  /** Its Last Seen, epoch ms, by Cloud Connect's clock. */
  lastSeen: Schema.Finite,
  /** The Sign-in it last reported with; null when that was an Access Token. */
  signInId: Schema.NullOr(Schema.String),
  /** When its User forgot it, epoch ms; null while it is not forgotten. */
  forgottenAt: Schema.NullOr(Schema.Finite),
})
  .evolve(
    'v2',
    {
      url: null,
      tunnel: null,
      status: Schema.Union([
        Schema.Struct({ _tag: Schema.Literal('Installing') }),
        Schema.Struct({ _tag: Schema.Literal('Opening') }),
        Schema.Struct({
          _tag: Schema.Literal('OpenFailed'),
          at: Schema.Finite,
          problem: Schema.String,
        }),
        Schema.Struct({
          _tag: Schema.Literal('Unchecked'),
          url: Schema.String,
        }),
        Schema.Struct({
          _tag: Schema.Literal('Reachable'),
          url: Schema.String,
          at: Schema.Finite,
        }),
        Schema.Struct({
          _tag: Schema.Literal('Unreachable'),
          url: Schema.String,
          at: Schema.Finite,
          problem: Schema.String,
        }),
      ]),
    },
    ({ url, tunnel, ...previous }) => ({
      ...previous,
      status:
        url === null
          ? { _tag: 'Opening' as const }
          : tunnel === null
            ? { _tag: 'Unchecked' as const, url }
            : tunnel.ok
              ? { _tag: 'Reachable' as const, url, at: tunnel.at }
              : {
                  _tag: 'Unreachable' as const,
                  url,
                  at: tunnel.at,
                  problem: tunnel.problem ?? 'Unknown',
                },
    }),
  )
  .build();

export type ConnectionRecord = typeof ConnectionRecord.Type;

/** Cloud Connect's table, for `SQLite.setup`, `D1.table` and its deploy guard. */
export const connectionsTable = StdTable.make('connections')
  .primary('pk', 'sk')
  .gsi('GSI1', 'GSI1PK', 'GSI1SK')
  .build();

export const connections = connectionsTable
  .entity(ConnectionRecord)
  .primary({ pk: ['id'] })
  .index('GSI1', 'byOwner', { pk: ['userId'], sk: ['id'] })
  .build();
