import type { ConnectionStatus } from '@kestack/connect/cloud';
import { describe, expect, it } from 'vitest';
import { offlineSaid } from '../link.ts';

/*
 * Whether a page says over its Draft that its Connection is out of reach:
 * never while its link is only on its way, as a page opens, so nothing
 * moves as the link comes up; once a link that was up dropped, or the
 * Connection is known to be out of reach.
 */

const seen = (status: ConnectionStatus) =>
  ({ _tag: 'Seen', lastSeen: 0, status }) as const;

const ready = (check: Extract<ConnectionStatus, { _tag: 'Ready' }>['check']) =>
  seen({ _tag: 'Ready', url: 'https://a.example', check });

describe('the Draft’s word that the Connection is out of reach', () => {
  it('is not said while the link first comes up', () => {
    expect(offlineSaid('linking', { _tag: 'Unknown' })).toBe(false);
    expect(offlineSaid('linking', ready({ _tag: 'Reachable', at: 0 }))).toBe(
      false,
    );
    expect(offlineSaid('linking', ready({ _tag: 'Unchecked' }))).toBe(false);
  });

  it('is said once a link that was up dropped', () => {
    expect(offlineSaid('relinking', { _tag: 'Unknown' })).toBe(true);
  });

  it('is said once the Connection is known to be out of reach', () => {
    expect(offlineSaid('linking', { _tag: 'Down', lastSeen: 0 })).toBe(true);
    expect(
      offlineSaid(
        'linking',
        seen({ _tag: 'SettingUp', step: { _tag: 'Opening' } }),
      ),
    ).toBe(true);
    expect(
      offlineSaid(
        'linking',
        seen({
          _tag: 'SettingUp',
          step: { _tag: 'Failed', at: 0, problem: 'no route' },
        }),
      ),
    ).toBe(true);
    expect(
      offlineSaid(
        'linking',
        ready({ _tag: 'Unreachable', at: 0, problem: 'no route' }),
      ),
    ).toBe(true);
  });

  it('is not said once linked', () => {
    expect(offlineSaid('linked', { _tag: 'Linked' })).toBe(false);
  });
});
