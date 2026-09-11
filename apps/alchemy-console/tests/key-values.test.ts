import { describe, expect, it } from 'vite-plus/test';
import {
  flattenScalars,
  isHttpUrl,
} from '../src/client/features/console/state-view/key-values.ts';

describe('key-value flattening', () => {
  it('keeps scalars, dots nested keys and skips deep or complex values', () => {
    expect(
      flattenScalars({
        name: 'api',
        enabled: true,
        count: null,
        skipped: undefined,
        nested: { url: 'https://x.dev', deeper: { gone: 1 } },
        tags: ['a', 'b'],
        many: [1, 2, 3, 4, 5, 6],
        objects: [{ a: 1 }],
      }),
    ).toEqual([
      { key: 'name', value: 'api' },
      { key: 'enabled', value: true },
      { key: 'count', value: null },
      { key: 'nested.url', value: 'https://x.dev' },
      { key: 'tags', value: ['a', 'b'] },
    ]);
  });

  it('returns nothing for non-objects', () => {
    expect(flattenScalars(null)).toEqual([]);
    expect(flattenScalars([1])).toEqual([]);
  });

  it('links only http(s) URLs', () => {
    expect(isHttpUrl('https://example.com/a?b=1')).toBe(true);
    expect(isHttpUrl('ftp://example.com')).toBe(false);
    expect(isHttpUrl('not a url')).toBe(false);
    expect(isHttpUrl(3)).toBe(false);
  });
});
