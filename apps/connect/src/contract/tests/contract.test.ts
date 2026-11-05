import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/rpc';
import { describe, expect, it } from 'vitest';
import { ESchema } from '@kestack/std-toolkit/eschema';
import { expectUpgradable } from '@kestack/std-toolkit/eschema/testing';
import {
  addressOf,
  CloudApi,
  Connection,
  ConnectionReport,
  ConnectionStatus,
  ReportAnswer,
} from '../index.js';
import { versionedValuesOf } from './versioned.js';

/*
 * Connect Cloud's contract sends every value as an ESchema, so it reads a
 * Connection that lags behind it, and each ESchema reads every version it
 * ever stored.
 */

const { problems, eschemas } = versionedValuesOf(CloudApi);

const ADDRESS = 'https://t1.example';

/** Each status of v1, as an App kept it, and what it reads as now. */
const READS: ReadonlyArray<
  readonly [
    { readonly _tag: string; readonly [field: string]: unknown },
    ConnectionStatus,
  ]
> = [
  [
    { _tag: 'Installing' },
    {
      _tag: 'SettingUp',
      step: { _tag: 'Downloading', elapsed: 0, received: 0 },
    },
  ],
  [{ _tag: 'Opening' }, { _tag: 'SettingUp', step: { _tag: 'Opening' } }],
  [
    { _tag: 'OpenFailed', at: 5, problem: 'no route' },
    {
      _tag: 'SettingUp',
      step: { _tag: 'Failed', at: 5, problem: 'no route' },
    },
  ],
  [
    { _tag: 'Unchecked', url: ADDRESS },
    { _tag: 'Ready', url: ADDRESS, check: { _tag: 'Unchecked' } },
  ],
  [
    { _tag: 'Reachable', url: ADDRESS, at: 5 },
    { _tag: 'Ready', url: ADDRESS, check: { _tag: 'Reachable', at: 5 } },
  ],
  [
    { _tag: 'Unreachable', url: ADDRESS, at: 5, problem: 'timed out' },
    {
      _tag: 'Ready',
      url: ADDRESS,
      check: { _tag: 'Unreachable', at: 5, problem: 'timed out' },
    },
  ],
];

describe('Connect Cloud contract', () => {
  it('sends every payload, success and item as an ESchema', () => {
    expect(problems).toEqual([]);
  });

  it.each(eschemas.map((each) => [each.name, each] as const))(
    '%s reads every version it stored',
    async (_, eschema) => {
      await expectUpgradable(eschema);
    },
  );

  it('reads a Report from a ke-connect that still sends each Plugin state', () => {
    expect(
      Schema.decodeUnknownSync(ConnectionReport.schema)({
        _v: 'v1',
        id: 'c1',
        name: 'laptop',
        key: 'k',
        version: '0.0.6',
        status: { _v: 'v1', _tag: 'Opening' },
        plugins: {},
      }),
    ).not.toHaveProperty('plugins');
  });

  it('answers a Report at a version a ke-connect before it calls newer', () => {
    expect(
      Schema.encodeSync(ReportAnswer.schema)({ wanted: {}, minConnect: null }),
    ).toMatchObject({ _v: 'v2' });
  });

  it('reads a Connection an App kept before it dropped each Plugin state', () => {
    expect(
      Schema.decodeUnknownSync(Connection.schema)({
        _v: 'v2',
        id: 'c1',
        name: 'laptop',
        key: 'k',
        version: '0.0.6',
        status: { _v: 'v1', _tag: 'Opening' },
        plugins: {},
        lastSeen: 1,
        wanted: {},
        minConnect: null,
        displayName: 'Work',
      }),
    ).not.toHaveProperty('plugins');
  });

  describe('a Connection Status', () => {
    const read = Schema.decodeUnknownSync(ConnectionStatus.schema);

    it.each(READS.map(([old, now]) => [old._tag, old, now] as const))(
      'reads %s from before it was the State of the Tunnel',
      (_, old, now) => {
        expect(read({ _v: 'v1', _value: old })).toEqual(now);
        expect(read(old)).toEqual(now);
      },
    );

    it('reads inside a Connection an App kept before it changed', () => {
      expect(
        Schema.decodeUnknownSync(Connection.schema)({
          _v: 'v3',
          id: 'c1',
          name: 'laptop',
          key: 'k',
          version: '0.0.6',
          status: {
            _v: 'v1',
            _value: { _tag: 'Reachable', url: ADDRESS, at: 5 },
          },
          lastSeen: 1,
          wanted: {},
          minConnect: null,
          displayName: null,
        }).status,
      ).toEqual({
        _tag: 'Ready',
        url: ADDRESS,
        check: { _tag: 'Reachable', at: 5 },
      });
    });

    it('is written at its newest version', () => {
      expect(
        Schema.encodeSync(ConnectionStatus.schema)({
          _tag: 'SettingUp',
          step: { _tag: 'Opening' },
        }),
      ).toEqual({
        _v: 'v2',
        _value: { _tag: 'SettingUp', step: { _tag: 'Opening' } },
      });
    });

    it('has an address only when Ready', () => {
      for (const [, now] of READS)
        expect(addressOf(now)).toBe(now._tag === 'Ready' ? ADDRESS : null);
    });

    it('takes only an https:// address', () => {
      const ready = (url: string) => ({
        _tag: 'Ready',
        url,
        check: { _tag: 'Unchecked' },
      });
      const valid = Schema.is(ConnectionStatus.schema);
      expect(valid(ready(ADDRESS))).toBe(true);
      expect(valid(ready('http://t1.example'))).toBe(false);
    });
  });

  it('names the Rpc and field of a plain struct or union', () => {
    const Note = ESchema.make('Note', { text: Schema.String }).build();
    class Lost extends Schema.TaggedError<Lost>()('Lost', {
      where: Schema.Struct({ path: Schema.String }),
    }) {}
    const plain = RpcGroup.make(
      Rpc.make('save', {
        payload: { text: Schema.String },
        success: Schema.Array(Note.schema),
        error: Lost,
      }),
      Rpc.make('watch', {
        payload: Note.schema,
        success: Schema.Union([Note.schema, Schema.Struct({})]),
        stream: true,
      }),
    );
    expect(versionedValuesOf(plain).problems).toEqual([
      'save payload is a plain Objects, not an ESchema',
      'save error Lost.where is a plain Objects, not an ESchema',
      'watch item is a plain Objects, not an ESchema',
    ]);
  });
});
