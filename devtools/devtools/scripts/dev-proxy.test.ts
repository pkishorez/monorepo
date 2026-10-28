import { describe, expect, it } from 'vitest';
import { isTrustedOrigin } from './dev-proxy.js';

describe('isTrustedOrigin', () => {
  it('trusts a request with no Origin, as from the CLI', () => {
    expect(isTrustedOrigin({ host: 'localhost:5173' })).toBe(true);
  });

  it("trusts the dev UI page's own origin", () => {
    expect(
      isTrustedOrigin({
        host: 'localhost:5173',
        origin: 'http://localhost:5173',
      }),
    ).toBe(true);
    expect(
      isTrustedOrigin({
        host: 'devtools.kishore.localhost',
        origin: 'https://devtools.kishore.localhost',
      }),
    ).toBe(true);
  });

  it('refuses every other origin', () => {
    expect(
      isTrustedOrigin({ host: 'localhost:5173', origin: 'http://evil.test' }),
    ).toBe(false);
    expect(
      isTrustedOrigin({
        host: 'localhost:5173',
        origin: 'http://localhost:5174',
      }),
    ).toBe(false);
    expect(isTrustedOrigin({ origin: 'http://localhost:5173' })).toBe(false);
    expect(isTrustedOrigin({ host: 'localhost:5173', origin: 'null' })).toBe(
      false,
    );
  });
});
