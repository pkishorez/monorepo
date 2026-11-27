import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { HeartbeatApi } from '../../heartbeat.js';

/*
 * Connect Cloud reads a Report from any older `ke-connect` (ADR 0011): what
 * `ke-connect` only sends may change freely, so long as this still reads.
 * Each Report is written out as that `ke-connect` sent it, as JSON, and read
 * through the Heartbeat's own `Report` payload, as Connect Cloud reads it. A
 * Report that no longer reads here must be read again before it ships.
 */

const ADDRESS = 'https://t1.example';
const HASH = 'a'.repeat(64);

/** What Connect Cloud reads a Report's JSON as, through the `Report` call. */
const read = Schema.decodeUnknownSync(
  Schema.fromJsonString(HeartbeatApi.requests.get('Report')!.payloadSchema),
);

/** A Report from `ke-connect` 0.0.6: v1, each Plugin's state, the Connection Status at v1. */
const V1 = `{
  "_v": "v1",
  "id": "c1",
  "name": "laptop",
  "key": "k1",
  "version": "0.0.6",
  "status": { "_v": "v1", "_value": { "_tag": "Reachable", "url": "${ADDRESS}", "at": 5 } },
  "plugins": { "code": { "_v": "v1", "_value": { "_tag": "Running", "hash": "${HASH}" } } }
}`;

/** A Report at v2: no Plugin states, the Connection Status at v2. */
const V2 = `{
  "_v": "v2",
  "id": "c1",
  "name": "laptop",
  "key": "k1",
  "version": "0.0.7",
  "status": {
    "_v": "v2",
    "_value": {
      "_tag": "Ready",
      "url": "${ADDRESS}",
      "check": { "_tag": "Unreachable", "at": 5, "problem": "timed out" }
    }
  }
}`;

/** Each Connection Status of v1, as `ke-connect` 0.0.6 sent it, and what Connect Cloud reads it as. */
const STATUSES: ReadonlyArray<readonly [string, unknown]> = [
  [
    '{ "_v": "v1", "_value": { "_tag": "Installing" } }',
    {
      _tag: 'SettingUp',
      step: { _tag: 'Downloading', elapsed: 0, received: 0 },
    },
  ],
  [
    '{ "_v": "v1", "_value": { "_tag": "Opening" } }',
    { _tag: 'SettingUp', step: { _tag: 'Opening' } },
  ],
  [
    '{ "_v": "v1", "_value": { "_tag": "OpenFailed", "at": 5, "problem": "no route" } }',
    {
      _tag: 'SettingUp',
      step: { _tag: 'Failed', at: 5, problem: 'no route' },
    },
  ],
  [
    `{ "_v": "v1", "_value": { "_tag": "Unchecked", "url": "${ADDRESS}" } }`,
    { _tag: 'Ready', url: ADDRESS, check: { _tag: 'Unchecked' } },
  ],
  [
    `{ "_v": "v1", "_value": { "_tag": "Unreachable", "url": "${ADDRESS}", "at": 5, "problem": "timed out" } }`,
    {
      _tag: 'Ready',
      url: ADDRESS,
      check: { _tag: 'Unreachable', at: 5, problem: 'timed out' },
    },
  ],
];

/** A v2 Report carrying `status`, as JSON. */
const withStatus = (status: string) =>
  `{ "_v": "v2", "id": "c1", "name": "laptop", "key": "k1", "version": "0.0.6", "status": ${status} }`;

describe('a Report from an older ke-connect', () => {
  it('reads at v1, each Plugin state left behind', () => {
    expect(read(V1)).toEqual({
      id: 'c1',
      name: 'laptop',
      key: 'k1',
      version: '0.0.6',
      status: {
        _tag: 'Ready',
        url: ADDRESS,
        check: { _tag: 'Reachable', at: 5 },
      },
    });
  });

  it('reads at v2', () => {
    expect(read(V2)).toEqual({
      id: 'c1',
      name: 'laptop',
      key: 'k1',
      version: '0.0.7',
      status: {
        _tag: 'Ready',
        url: ADDRESS,
        check: { _tag: 'Unreachable', at: 5, problem: 'timed out' },
      },
    });
  });

  it.each(STATUSES)('reads the Connection Status %s', (status, now) => {
    expect(read(withStatus(status))).toMatchObject({ status: now });
  });
});
