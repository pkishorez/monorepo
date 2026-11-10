import type {
  Connection as ConnectionSchema,
  ConnectionStatus,
} from '@kestack/connect/cloud';
import { describe, expect, it } from 'vitest';
import { ON_ITS_WAY, recheckIn, STUCK } from '../actor.ts';

/*
 * How soon Connect Cloud is asked for the list again: every few seconds
 * while a Connection is on its way, every ten while one is stuck or down,
 * not at all once every one is linked; the one that needs it most sets the
 * pace.
 */

type Connection = typeof ConnectionSchema.Type;

const NOW = 1_000_000;

const ready = (
  check: Extract<ConnectionStatus, { _tag: 'Ready' }>['check'],
): ConnectionStatus => ({ _tag: 'Ready', url: 'https://a.example', check });

const settingUp = (
  step: Extract<ConnectionStatus, { _tag: 'SettingUp' }>['step'],
): ConnectionStatus => ({ _tag: 'SettingUp', step });

const connection = (
  id: string,
  status: ConnectionStatus,
  {
    lastSeen = NOW,
    version = '0.0.5',
  }: { readonly lastSeen?: number; readonly version?: string } = {},
): Connection => ({
  id,
  name: id,
  key: `key-${id}`,
  version,
  status,
  lastSeen,
  wanted: {},
  minConnect: '0.0.5',
  displayName: null,
});

const REACHABLE = ready({ _tag: 'Reachable', at: NOW });

/** The pace for `connection` alone, its link `link`, its record believed. */
const paceOf = (
  each: Connection,
  link: 'linking' | 'linked' | 'relinking' = 'linking',
  checked = true,
) => recheckIn([each], { [each.id]: link }, checked, NOW);

describe('the recheck', () => {
  it('asks soon for a Connection on its way', () => {
    // Nothing believed yet: not checked, or not listed with a link.
    expect(paceOf(connection('m1', REACHABLE), 'linking', false)).toBe(
      ON_ITS_WAY,
    );
    expect(recheckIn([connection('m1', REACHABLE)], {}, false, NOW)).toBe(
      ON_ITS_WAY,
    );
    expect(
      paceOf(
        connection(
          'm1',
          settingUp({ _tag: 'Downloading', elapsed: 0, received: 0 }),
        ),
      ),
    ).toBe(ON_ITS_WAY);
    expect(paceOf(connection('m1', settingUp({ _tag: 'Opening' })))).toBe(
      ON_ITS_WAY,
    );
    expect(
      paceOf(connection('m1', ready({ _tag: 'Unchecked' })), 'relinking'),
    ).toBe(ON_ITS_WAY);
    expect(paceOf(connection('m1', REACHABLE))).toBe(ON_ITS_WAY);
  });

  it('asks soon for an Outdated Connection seen lately, whatever its tunnel says', () => {
    const broken = ready({ _tag: 'Unreachable', at: NOW, problem: 'no route' });
    expect(paceOf(connection('m1', broken, { version: '0.0.4' }))).toBe(
      ON_ITS_WAY,
    );
    expect(paceOf(connection('m1', REACHABLE, { version: '0.0.4' }))).toBe(
      ON_ITS_WAY,
    );
  });

  it('asks less often for a Connection stuck or down', () => {
    expect(
      paceOf(
        connection('m1', settingUp({ _tag: 'Failed', at: NOW, problem: 'no' })),
      ),
    ).toBe(STUCK);
    expect(
      paceOf(
        connection(
          'm1',
          ready({ _tag: 'Unreachable', at: NOW, problem: 'no route' }),
        ),
      ),
    ).toBe(STUCK);
    const gone = { lastSeen: NOW - 60_000 };
    expect(paceOf(connection('m1', REACHABLE, gone))).toBe(STUCK);
    // Outdated and down: it is not coming back soon either.
    expect(
      paceOf(connection('m1', REACHABLE, { ...gone, version: '0.0.4' })),
    ).toBe(STUCK);
  });

  it('asks nothing for a Connection linked', () => {
    expect(paceOf(connection('m1', REACHABLE), 'linked')).toBeNull();
  });

  it('goes at the pace of the Connection that needs it most', () => {
    const down = connection('m1', REACHABLE, { lastSeen: NOW - 60_000 });
    const linked = connection('m2', REACHABLE);
    const coming = connection('m3', settingUp({ _tag: 'Opening' }));
    const links = { m1: 'relinking', m2: 'linked', m3: 'linking' } as const;
    expect(recheckIn([down, linked], links, true, NOW)).toBe(STUCK);
    expect(recheckIn([down, linked, coming], links, true, NOW)).toBe(
      ON_ITS_WAY,
    );
  });

  it('asks nothing once every Connection is linked, or none is listed', () => {
    const links = { m1: 'linked', m2: 'linked' } as const;
    expect(
      recheckIn(
        [connection('m1', REACHABLE), connection('m2', REACHABLE)],
        links,
        true,
        NOW,
      ),
    ).toBeNull();
    expect(recheckIn([], {}, true, NOW)).toBeNull();
  });
});
