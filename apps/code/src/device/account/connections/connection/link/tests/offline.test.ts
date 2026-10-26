import { describe, expect, it } from 'vitest';
import { offlineSaid } from '../link.ts';

/*
 * Whether a page says over its Draft that its Connection is out of reach:
 * never while its link is only on its way, as a page opens, so nothing
 * moves as the link comes up; once a link that was up dropped, or the
 * Connection is known to be out of reach.
 */

const seen = (status: { readonly _tag: string }) =>
  ({ _tag: 'Seen', lastSeen: 0, status }) as const;

describe('the Draft’s word that the Connection is out of reach', () => {
  it('is not said while the link first comes up', () => {
    expect(offlineSaid('linking', { _tag: 'Unknown' })).toBe(false);
    expect(offlineSaid('linking', seen({ _tag: 'Reachable' }) as never)).toBe(
      false,
    );
    expect(offlineSaid('linking', seen({ _tag: 'Unchecked' }) as never)).toBe(
      false,
    );
  });

  it('is said once a link that was up dropped', () => {
    expect(offlineSaid('relinking', { _tag: 'Unknown' })).toBe(true);
  });

  it('is said once the Connection is known to be out of reach', () => {
    expect(offlineSaid('linking', { _tag: 'Down', lastSeen: 0 })).toBe(true);
    expect(offlineSaid('linking', seen({ _tag: 'Opening' }) as never)).toBe(
      true,
    );
  });

  it('is not said once linked', () => {
    expect(offlineSaid('linked', { _tag: 'Linked' })).toBe(false);
  });
});
