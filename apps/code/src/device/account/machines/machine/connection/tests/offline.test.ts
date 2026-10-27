import { describe, expect, it } from 'vitest';
import { offlineSaid } from '../connection.ts';

/*
 * Whether a page says over its Draft that its Machine is out of reach:
 * never while its line is only on its way, as a page opens, so nothing
 * moves as the line comes up; once a line that was up dropped, or the
 * Machine is known to be out of reach.
 */

const seen = (status: { readonly _tag: string }) =>
  ({ _tag: 'Seen', lastSeen: 0, status }) as const;

describe('the Draft’s word that the Machine is out of reach', () => {
  it('is not said while the line first comes up', () => {
    expect(offlineSaid('connecting', { _tag: 'Unknown' })).toBe(false);
    expect(
      offlineSaid('connecting', seen({ _tag: 'Reachable' }) as never),
    ).toBe(false);
    expect(
      offlineSaid('connecting', seen({ _tag: 'Unchecked' }) as never),
    ).toBe(false);
  });

  it('is said once a line that was up dropped', () => {
    expect(offlineSaid('reconnecting', { _tag: 'Unknown' })).toBe(true);
  });

  it('is said once the Machine is known to be out of reach', () => {
    expect(offlineSaid('connecting', { _tag: 'Down', lastSeen: 0 })).toBe(true);
    expect(offlineSaid('connecting', seen({ _tag: 'Opening' }) as never)).toBe(
      true,
    );
  });

  it('is not said once connected', () => {
    expect(offlineSaid('connected', { _tag: 'Connected' })).toBe(false);
  });
});
