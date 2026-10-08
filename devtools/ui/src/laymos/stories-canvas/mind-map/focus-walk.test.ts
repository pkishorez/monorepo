import { describe, expect, it } from 'vitest';
import type { StoryNode } from 'laymos/story/schema';

import { walkFocus, type Walk } from './focus-walk';
import { layoutMindMap } from './mind-map-layout';

const story = (id: string, stories: readonly StoryNode[] = []): StoryNode => ({
  id,
  name: id.split('/').at(-1)!,
  path: id.split('/').slice(1).join('/'),
  title: id,
  pitch: '',
  body: '',
  stories,
  proofs: [],
  issues: [],
});

const tree = story('top', [
  story('top/a', [story('top/a/deep')]),
  story('top/b'),
  story('top/c'),
]);

const mapOf = (...open: string[]) =>
  layoutMindMap(tree, new Set(open), () => ({ width: 100, height: 50 }));

describe('walkFocus', () => {
  it('goes right to the first shown sub-Story', () => {
    expect(walkFocus(mapOf('top'), 'top', 'firstChild')).toEqual({
      kind: 'focus',
      key: 'top/a',
    });
  });

  it('opens a closed card with sub-Stories and focuses its first', () => {
    expect(walkFocus(mapOf(), 'top', 'firstChild')).toEqual({
      kind: 'toggle',
      key: 'top',
      focus: 'top/a',
    });
    expect(walkFocus(mapOf('top'), 'top/a', 'firstChild')).toEqual({
      kind: 'toggle',
      key: 'top/a',
      focus: 'top/a/deep',
    });
  });

  it('does nothing going right from a card without sub-Stories', () => {
    expect(walkFocus(mapOf('top'), 'top/b', 'firstChild')).toBeUndefined();
  });

  it('goes left to the parent, and nowhere from the top', () => {
    expect(walkFocus(mapOf('top', 'top/a'), 'top/a/deep', 'parent')).toEqual({
      kind: 'focus',
      key: 'top/a',
    });
    expect(walkFocus(mapOf('top'), 'top', 'parent')).toBeUndefined();
  });

  it('goes up and down between siblings, stopping at the ends', () => {
    const map = mapOf('top');
    expect(walkFocus(map, 'top/b', 'previousSibling')).toEqual({
      kind: 'focus',
      key: 'top/a',
    });
    expect(walkFocus(map, 'top/b', 'nextSibling')).toEqual({
      kind: 'focus',
      key: 'top/c',
    });
    expect(walkFocus(map, 'top/a', 'previousSibling')).toBeUndefined();
    expect(walkFocus(map, 'top/c', 'nextSibling')).toBeUndefined();
    expect(walkFocus(map, 'top', 'nextSibling')).toBeUndefined();
  });

  it('never opens or closes anything when moving focus', () => {
    const map = mapOf('top', 'top/a');
    for (const walk of [
      'parent',
      'previousSibling',
      'nextSibling',
      'firstChild',
    ] as const satisfies readonly Walk[])
      for (const card of map.cards) {
        const step = walkFocus(map, card.key, walk);
        if (step?.kind === 'toggle') expect(card.children).toEqual([]);
      }
  });

  it('ignores unknown cards', () => {
    expect(walkFocus(mapOf(), 'nowhere', 'nextSibling')).toBeUndefined();
  });
});
