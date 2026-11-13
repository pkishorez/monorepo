import { describe, expect, it } from 'vitest';
import {
  BuildId,
  computeBuildId,
  isPrecacheCacheName,
  isRuntimeCacheName,
  isFormerCacheName,
  isPwaCacheName,
  precacheCacheName,
  runtimeCacheName,
} from '../index.js';
import { fnv1a64 } from '../fnv1a.js';

const precache = [
  { url: '/assets/app-1.js', revision: 'a1' },
  { url: '/_shell', revision: 'b2' },
];

describe('computeBuildId', () => {
  it('matches the published FNV-1a 64 vectors', () => {
    expect(fnv1a64('')).toBe('cbf29ce484222325');
    expect(fnv1a64('a')).toBe('af63dc4c8601ec8c');
    expect(fnv1a64('foobar')).toBe('85944171f73967e8');
  });

  it('is stable across runs and entry order', () => {
    const id = computeBuildId({ precache, config: { b: 1, a: [2] } });
    expect(id).toMatch(/^[0-9a-f]{16}$/);
    expect(
      computeBuildId({
        precache: [...precache].reverse(),
        config: { a: [2], b: 1 },
      }),
    ).toBe(id);
  });

  it('changes when a revision or the config changes', () => {
    const id = computeBuildId({ precache, config: {} });
    expect(
      computeBuildId({
        precache: [{ ...precache[0]!, revision: 'a2' }, precache[1]!],
        config: {},
      }),
    ).not.toBe(id);
    expect(computeBuildId({ precache, config: { x: 1 } })).not.toBe(id);
  });
});

describe('cache names', () => {
  const buildId = BuildId.make('abc');

  it('prefixes every cache of the PWA', () => {
    expect(precacheCacheName(buildId)).toBe('web-platform:pwa:precache:abc');
    expect(runtimeCacheName('images')).toBe('web-platform:pwa:runtime:images');
  });

  it('classifies names', () => {
    expect(isPrecacheCacheName(precacheCacheName(buildId))).toBe(true);
    expect(isRuntimeCacheName(runtimeCacheName('images'))).toBe(true);
    expect(isRuntimeCacheName(precacheCacheName(buildId))).toBe(false);
    expect(isPwaCacheName(precacheCacheName(buildId))).toBe(true);
    expect(isPwaCacheName('workbox-precache')).toBe(false);
  });

  it('still knows a cache under the former name', () => {
    expect(isFormerCacheName('pwa-toolkit:precache:abc')).toBe(true);
    expect(isPwaCacheName('pwa-toolkit:runtime:images')).toBe(true);
    expect(isFormerCacheName(precacheCacheName(buildId))).toBe(false);
    expect(isPrecacheCacheName('pwa-toolkit:precache:abc')).toBe(false);
  });
});
