import { describe, expect, it } from 'vitest';

import { resolveLink } from './telling-links';

const index = {
  stories: new Set(['std-toolkit', 'std-toolkit/evolving-schema']),
  proofs: new Set(['std-toolkit/evolving-schema/old-rows-still-read']),
};

describe('resolveLink', () => {
  it('reads a Story id', () => {
    expect(resolveLink('std-toolkit/evolving-schema', index)).toEqual({
      kind: 'story',
      id: 'std-toolkit/evolving-schema',
    });
  });

  it('reads a Proof id', () => {
    expect(
      resolveLink('std-toolkit/evolving-schema/old-rows-still-read', index),
    ).toEqual({
      kind: 'proof',
      id: 'std-toolkit/evolving-schema/old-rows-still-read',
    });
  });

  it('ignores a trailing slash', () => {
    expect(resolveLink('std-toolkit/evolving-schema/', index).kind).toBe(
      'story',
    );
  });

  it('marks an id that names nothing as broken', () => {
    expect(resolveLink('std-toolkit/caching', index)).toEqual({
      kind: 'broken',
      id: 'std-toolkit/caching',
    });
  });

  it('leaves URLs, anchors and paths alone', () => {
    for (const href of [
      'https://effect.website',
      'mailto:a@b.c',
      '#usage',
      '/docs',
      '//cdn.example.com/x',
    ]) {
      expect(resolveLink(href, index)).toEqual({ kind: 'external', href });
    }
  });
});
