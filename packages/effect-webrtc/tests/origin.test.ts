import { describe, expect, it } from 'vitest';
import { isOriginUnder } from '../src/signaling/durable/worker/index.js';

describe('isOriginUnder', () => {
  it('trusts a page on the cookie domain or under it', () => {
    expect(isOriginUnder('https://example.com', '.example.com')).toBe(true);
    expect(isOriginUnder('https://app.example.com', '.example.com')).toBe(true);
    expect(isOriginUnder('https://pr1.app.example.com', 'example.com')).toBe(
      true,
    );
  });

  it('refuses any other site', () => {
    expect(isOriginUnder('https://evilexample.com', '.example.com')).toBe(
      false,
    );
    expect(isOriginUnder('https://example.com.evil.io', '.example.com')).toBe(
      false,
    );
    expect(isOriginUnder('https://app.example.com', '')).toBe(false);
  });

  it('never trusts the opaque "null" origin or a non-web scheme', () => {
    expect(isOriginUnder('null', '.example.com')).toBe(false);
    expect(isOriginUnder('ledger://example.com', '.example.com')).toBe(false);
  });
});
