import { describe, expect, it } from 'vitest';
import { isTrustedOrigin, validateTrustedOrigins } from '../index.js';

describe('trustedOrigins', () => {
  const patterns = ['https://app.example.com', '*.preview.example.com'];

  it('matches web origins exactly or by host pattern', () => {
    expect(isTrustedOrigin('https://app.example.com', patterns)).toBe(true);
    expect(isTrustedOrigin('https://pr1.preview.example.com', patterns)).toBe(
      true,
    );
    expect(isTrustedOrigin('http://pr1.preview.example.com', patterns)).toBe(
      false,
    );
    expect(isTrustedOrigin('https://evil.example.com', patterns)).toBe(false);
  });

  it('never trusts the opaque "null" origin', () => {
    expect(isTrustedOrigin('null', patterns)).toBe(false);
  });

  it('rejects patterns that are not web origins', () => {
    expect(() => validateTrustedOrigins(['ledger://oauth'])).toThrow(
      /Invalid trustedOrigins pattern/,
    );
  });
});
