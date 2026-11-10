import { Schema } from 'effect';
import { StdTable } from '@kestack/std-toolkit/db';
import { PluginState } from '@kestack/cli-platform/plugins/contract';
import { EntityESchema } from '@kestack/std-toolkit/eschema';

/*
 * Where Connect Cloud keeps its records: one std Table, `connections`,
 * on Connect Cloud's D1 database. A Connection id is one Connection's alone, across
 * every User, so each Connection is its own partition, keyed by its id; its
 * owner's Connections are found through `byOwner`. A forgotten Connection stays
 * as a tombstone, with `forgottenAt` set and the Sign-in it last reported
 * with (ADR 0004).
 */

/** A status as v3 and before stored it, flat. */
type FlatStatus =
  | { readonly _tag: 'Installing' }
  | { readonly _tag: 'Opening' }
  | {
      readonly _tag: 'OpenFailed';
      readonly at: number;
      readonly problem: string;
    }
  | { readonly _tag: 'Unchecked'; readonly url: string }
  | { readonly _tag: 'Reachable'; readonly url: string; readonly at: number }
  | {
      readonly _tag: 'Unreachable';
      readonly url: string;
      readonly at: number;
      readonly problem: string;
    };

/** A status v3 stored, as v4 stores it. */
const statusOfV3 = (status: FlatStatus) => {
  switch (status._tag) {
    case 'Installing':
      return {
        _tag: 'SettingUp',
        step: { _tag: 'Downloading', elapsed: 0, received: 0 },
      } as const;
    case 'Opening':
      return { _tag: 'SettingUp', step: { _tag: 'Opening' } } as const;
    case 'OpenFailed':
      return {
        _tag: 'SettingUp',
        step: { _tag: 'Failed', at: status.at, problem: status.problem },
      } as const;
    case 'Unchecked':
      return {
        _tag: 'Ready',
        url: status.url,
        check: { _tag: 'Unchecked' },
      } as const;
    case 'Reachable':
      return {
        _tag: 'Ready',
        url: status.url,
        check: { _tag: 'Reachable', at: status.at },
      } as const;
    case 'Unreachable':
      return {
        _tag: 'Ready',
        url: status.url,
        check: {
          _tag: 'Unreachable',
          at: status.at,
          problem: status.problem,
        },
      } as const;
  }
};

/**
 * One Connection as stored: its last Report (see `ConnectionReport`), its owner,
 * Last Seen, its Display Name, and whether it was forgotten. Its own fields, not the
 * contract's, so a change to the contract never silently changes the rows.
 * */
export const ConnectionRecord = EntityESchema.make('Connection', 'id', {
  name: Schema.String,
  key: Schema.String,
  version: Schema.String,
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
  plugins: Schema.Record(Schema.String, PluginState.schema),
  /** The User it reports as. */
  userId: Schema.String,
  /** Its Last Seen, epoch ms, by Connect Cloud's clock. */
  lastSeen: Schema.Finite,
  /** The Sign-in it last reported with; null when that was an Access Token. */
  signInId: Schema.NullOr(Schema.String),
  /** When its User forgot it, epoch ms; null while it is not forgotten. */
  forgottenAt: Schema.NullOr(Schema.Finite),
})
  // v2: its Display Name, which its User gives it and a Report never
  // changes; null until one is given.
  .evolve('v2', { displayName: Schema.NullOr(Schema.String) }, (v1) => ({
    ...v1,
    displayName: null,
  }))
  // v3: where each Plugin stands is the Connection's own, never Reported.
  .evolve('v3', { plugins: null }, ({ plugins: _, ...v2 }) => v2)
  // v4: the status is the Tunnel's State, SettingUp at a step or Ready at an
  // address with how its last check went.
  .evolve(
    'v4',
    {
      status: Schema.Union([
        Schema.Struct({
          _tag: Schema.Literal('SettingUp'),
          step: Schema.Union([
            Schema.Struct({
              _tag: Schema.Literal('Downloading'),
              elapsed: Schema.Finite,
              received: Schema.Finite,
            }),
            Schema.Struct({ _tag: Schema.Literal('Opening') }),
            Schema.Struct({
              _tag: Schema.Literal('Failed'),
              at: Schema.Finite,
              problem: Schema.String,
            }),
          ]),
        }),
        Schema.Struct({
          _tag: Schema.Literal('Ready'),
          url: Schema.String,
          check: Schema.Union([
            Schema.Struct({ _tag: Schema.Literal('Unchecked') }),
            Schema.Struct({
              _tag: Schema.Literal('Reachable'),
              at: Schema.Finite,
            }),
            Schema.Struct({
              _tag: Schema.Literal('Unreachable'),
              at: Schema.Finite,
              problem: Schema.String,
            }),
          ]),
        }),
      ]),
    },
    ({ status, ...v3 }) => ({ ...v3, status: statusOfV3(status) }),
  )
  .build();

export type ConnectionRecord = typeof ConnectionRecord.Type;

/** Connect Cloud's table, for `SQLite.setup`, `D1.table` and its deploy guard. */
export const connectionsTable = StdTable.make('connections')
  .primary('pk', 'sk')
  .gsi('GSI1', 'GSI1PK', 'GSI1SK')
  .build();

export const connections = connectionsTable
  .entity(ConnectionRecord)
  .primary({ pk: ['id'] })
  .index('GSI1', 'byOwner', { pk: ['userId'], sk: ['id'] })
  .build();
