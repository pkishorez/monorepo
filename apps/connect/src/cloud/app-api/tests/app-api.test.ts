import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { expectUpgradable } from '@kestack/std-toolkit/eschema/testing';
import { versionedValuesOf } from '../../../heartbeat/tests/versioned.js';
import { AppApi, Connection, isOutdated } from '../index.js';

/*
 * What Connect Cloud and an App say to each other is sent as ESchemas too, so
 * an App reads the Connections it kept on its device at any earlier version;
 * and when a Connection is Outdated.
 */

const { problems, eschemas } = versionedValuesOf(AppApi);

const ADDRESS = 'https://t1.example';

describe('the App API', () => {
  it('sends every payload, success and item as an ESchema', () => {
    expect(problems).toEqual([]);
  });

  it.each(eschemas.map((each) => [each.name, each] as const))(
    '%s reads every version it stored',
    async (_, eschema) => {
      await expectUpgradable(eschema);
    },
  );

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

  it('reads the status inside a Connection an App kept before it changed', () => {
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
});

describe('the Minimum Connect', () => {
  const at = (version: string, minConnect: string | null): Connection => ({
    id: 'c1',
    name: 'laptop',
    key: 'k',
    version,
    status: { _tag: 'SettingUp', step: { _tag: 'Opening' } },
    lastSeen: 1,
    wanted: {},
    minConnect,
    displayName: null,
  });

  it('makes a Connection below it Outdated, and none when there is none', () => {
    expect(isOutdated(at('0.0.4', '0.0.5'))).toBe(true);
    expect(isOutdated(at('0.0.5', '0.0.5'))).toBe(false);
    expect(isOutdated(at('0.1.0', '0.0.5'))).toBe(false);
    expect(isOutdated(at('0.0.5-next.1', '0.0.5'))).toBe(true);
    expect(isOutdated(at('0.0.1', null))).toBe(false);
  });
});
