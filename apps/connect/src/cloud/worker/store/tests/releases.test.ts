import { describe, expect, it } from 'vitest';
import { fromReleaseKey, releaseKey } from '../releases.js';

/* How Connect Cloud keeps each Release File: by its Plugin's name and hash. */

const HASH = 'a'.repeat(64);

describe('a Release File', () => {
  it('is kept as `<name>/<sha256>.mjs`', () => {
    expect(releaseKey('code', HASH)).toBe(`code/${HASH}.mjs`);
    expect(fromReleaseKey(releaseKey('code', HASH))).toEqual({
      name: 'code',
      hash: HASH,
    });
    for (const key of [`../${HASH}.mjs`, 'code/latest.mjs', `code/${HASH}`])
      expect(fromReleaseKey(key)).toBeNull();
  });
});
