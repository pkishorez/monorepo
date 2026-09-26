import { describe, expect, it } from 'vitest';
import { mergeHeaders } from './headers.js';

describe('mergeHeaders', () => {
  it('writes no-cache rules when there is no file', () => {
    expect(mergeHeaders(null, ['/sw.js'])).toBe(
      '# pwa-toolkit: begin\n/sw.js\n  Cache-Control: no-cache\n# pwa-toolkit: end\n',
    );
  });

  it('keeps the app rules and leaves paths it already lists', () => {
    const existing =
      '/assets/*\n  Cache-Control: immutable\n/sw.js\n  X-Own: 1';
    const merged = mergeHeaders(existing, ['/sw.js', '/manifest.webmanifest']);
    expect(merged.startsWith(`${existing}\n# pwa-toolkit: begin\n`)).toBe(true);
    expect(merged).toContain(
      '/manifest.webmanifest\n  Cache-Control: no-cache',
    );
    expect(merged).not.toContain('/sw.js\n  Cache-Control');
  });

  it('replaces its own block when run again', () => {
    const once = mergeHeaders('/a\n  X: 1\n', ['/sw.js']);
    expect(mergeHeaders(once, ['/sw.js'])).toBe(once);
  });
});
