import { describe, expect, it } from 'vitest';

import { isAllowedOrigin } from './origin.ts';

describe('isAllowedOrigin', () => {
  it.each([
    'https://kishore.app',
    'https://code.kishore.app',
    'https://deep.code.kishore.app',
  ])('allows %s', (origin) => {
    expect(isAllowedOrigin(origin)).toBe(true);
  });

  it.each([
    'https://attackerkishore.app',
    'https://kishore.app.attacker.example',
    'http://kishore.app',
    'not an origin',
  ])('rejects %s', (origin) => {
    expect(isAllowedOrigin(origin)).toBe(false);
  });
});
