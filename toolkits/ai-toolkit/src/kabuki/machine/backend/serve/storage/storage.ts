import { Schema } from 'effect';
import { StdTable } from '@kestack/std-toolkit/db';
import { EntityESchema } from '@kestack/std-toolkit/eschema';

/*
 * Where the Machines Backend keeps its records: one std Table, `machines`,
 * on the Backend's D1 database. A Machine id is one Machine's alone, across
 * every User, so each Machine is its own partition, keyed by its id; its
 * owner's Machines are found through `byOwner`. A forgotten Machine stays
 * as a tombstone, with `forgottenAt` set and the Sign-in it last reported
 * with (ADR 0016).
 */

/**
 * One Machine as stored: its last Report (see `MachineReport`), its owner,
 * Last Seen, and whether it was forgotten. Its own fields, not the
 * contract's, so a change to the contract never silently changes the rows.
 * v1 kept the address and the last Tunnel Check apart; v2 keeps the status
 * they make, and a v1 row with no address reads as Opening.
 */
export const MachineRecord = EntityESchema.make('Machine', 'id', {
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
  /** Its Last Seen, epoch ms, by the Backend's clock. */
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

export type MachineRecord = typeof MachineRecord.Type;

/** The Machines Backend's table, for `SQLite.setup`, `D1.table` and its deploy guard. */
export const machinesTable = StdTable.make('machines')
  .primary('pk', 'sk')
  .gsi('GSI1', 'GSI1PK', 'GSI1SK')
  .build();

export const machines = machinesTable
  .entity(MachineRecord)
  .primary({ pk: ['id'] })
  .index('GSI1', 'byOwner', { pk: ['userId'], sk: ['id'] })
  .build();
