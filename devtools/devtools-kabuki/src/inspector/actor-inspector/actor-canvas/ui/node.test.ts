import { describe, expect, it } from 'vitest';
import { readableKey } from './node.tsx';

/*
 * A small card's key, as a person reads it: a UUID by its first eight, a
 * long id by its start and end, a short one whole, and a list of ids by
 * its parts in order.
 */

describe('a card key, made readable', () => {
  it('shows a UUID by its first eight', () => {
    expect(readableKey('2c93ede4-1c66-421b-8f2a-0123456789ab')).toBe(
      '2c93ede4',
    );
  });

  it('keeps a short id whole', () => {
    expect(readableKey('DTaTKRJUMmHSYCccaaCt')).toBe('DTaTKRJUMmHSYCccaaCt');
  });

  it('shows a long id by its start and end', () => {
    expect(readableKey('local_ZGV2QGtlc3RhY2sudGVzdA_more')).toBe(
      'local_ZGV2…zdA_more',
    );
  });

  it('shows a list of ids by its parts, in order', () => {
    expect(
      readableKey(
        JSON.stringify([
          '2c93ede4-1c66-421b-8f2a-0123456789ab',
          'a1b2c3d4-0000-4000-8000-000000000000',
        ]),
      ),
    ).toBe('2c93ede4 / a1b2c3d4');
  });
});
