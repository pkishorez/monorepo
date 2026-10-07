import { describe, expect, it } from 'vitest';
import { assertAfterStart } from '../start-setup.js';

describe('assertAfterStart', () => {
  const start = { name: 'tanstack-start-core:post-build' };
  const own = { name: 'pwa-toolkit:build' };
  it('throws when pwa() comes before tanstackStart()', () => {
    expect(() => assertAfterStart([own, start], own.name)).toThrow(/after/);
    expect(() => assertAfterStart([start, own], own.name)).not.toThrow();
    expect(() => assertAfterStart([own], own.name)).not.toThrow();
  });
});
