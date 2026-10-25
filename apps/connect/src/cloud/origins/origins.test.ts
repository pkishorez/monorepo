import { describe, expect, it } from 'vitest';
import { allowsOrigin } from './origins.js';

describe('allowsOrigin', () => {
  const allows = allowsOrigin(['https://*.kishore.app', 'http://localhost:*']);

  it('lets in any subdomain of a `*.` pattern', () => {
    expect(allows('https://code.kishore.app')).toBe(true);
    expect(allows('https://pr12-code.kishore.app')).toBe(true);
  });

  it('keeps out the bare domain and any other site', () => {
    expect(allows('https://kishore.app')).toBe(false);
    expect(allows('https://evil.app')).toBe(false);
    expect(allows('https://code.kishore.app.evil.app')).toBe(false);
    expect(allows('http://code.kishore.app')).toBe(false);
  });

  it('takes any port, or none, for `:*`', () => {
    expect(allows('http://localhost:5173')).toBe(true);
    expect(allows('http://localhost')).toBe(true);
    expect(allows('https://code.kishore.app:8443')).toBe(false);
  });
});
