import { describe, expect, it } from 'vitest';
import { isTrustedOrigin, validateTrustedOrigins } from '../index.js';

describe('trustedOrigins', () => {
  const patterns = [
    'https://app.example.com',
    '*.preview.example.com',
    'ledger://oauth',
  ];

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

  it('matches an app scheme by scheme and path, not by its "null" origin', () => {
    expect(isTrustedOrigin('ledger://oauth', patterns)).toBe(true);
    expect(isTrustedOrigin('ledger://oauth/callback?code=1', patterns)).toBe(
      true,
    );
    expect(isTrustedOrigin('ledger://oauthx', patterns)).toBe(false);
    expect(isTrustedOrigin('ledger://elsewhere', patterns)).toBe(false);
    expect(isTrustedOrigin('evil://oauth/callback', patterns)).toBe(false);
  });

  it('never trusts the opaque "null" origin', () => {
    expect(isTrustedOrigin('null', patterns)).toBe(false);
    expect(isTrustedOrigin('null', ['ledger://'])).toBe(false);
  });

  it('trusts a whole scheme when the pattern names no path', () => {
    expect(isTrustedOrigin('exp://127.0.0.1:8081/--/oauth', ['exp://'])).toBe(
      true,
    );
  });

  it('accepts app schemes but no wildcard in them', () => {
    expect(() => validateTrustedOrigins(['ledger://oauth'])).not.toThrow();
    expect(() => validateTrustedOrigins(['ledger://*'])).toThrow(
      /Invalid trustedOrigins pattern/,
    );
  });
});
