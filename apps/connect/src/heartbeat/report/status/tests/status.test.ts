import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { addressOf, ConnectionStatus } from '../index.js';

/* A Connection Status: what it reads from every version, and what it writes. */

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

describe('a Connection Status', () => {
  const read = Schema.decodeUnknownSync(ConnectionStatus.schema);

  it.each(READS.map(([old, now]) => [old._tag, old, now] as const))(
    'reads %s from before it was the State of the Tunnel',
    (_, old, now) => {
      expect(read({ _v: 'v1', _value: old })).toEqual(now);
      expect(read(old)).toEqual(now);
    },
  );

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
