import { describe, expect, it } from 'vitest';
import type { ProofLeaf, StoryNode } from 'laymos/story/schema';

import {
  familyRect,
  layoutMindMap,
  type PlacedCard,
  type Rect,
  type Size,
} from './mind-map-layout';

const proof = (id: string): ProofLeaf => ({
  id,
  name: id.split('/').at(-1)!,
  title: id,
  description: null,
  venue: 'process',
  critical: false,
  source: { path: `${id}.proof.ts`, content: '' },
});

const story = (
  id: string,
  stories: readonly StoryNode[] = [],
  proofs: readonly string[] = [],
): StoryNode => ({
  id,
  name: id.split('/').at(-1)!,
  path: id.split('/').slice(1).join('/'),
  title: id,
  pitch: '',
  body: '',
  stories,
  proofs: proofs.map((name) => proof(`${id}/${name}`)),
  issues: [],
});

const tree = story(
  'top',
  [
    story('top/a', [story('top/a/deep', [], ['p1'])], ['p1', 'p2']),
    story('top/b', [], ['p1']),
  ],
  ['end-to-end'],
);

const closed: Size = { width: 200, height: 100 };
const opened: Size = { width: 300, height: 400 };
const sizes =
  (open: ReadonlySet<string>) =>
  (story: StoryNode): Size =>
    open.has(story.id) ? opened : closed;

const layout = (open: readonly string[]) => {
  const set = new Set(open);
  return layoutMindMap(tree, set, sizes(set), {
    column: 50,
    row: 10,
    branch: 20,
  });
};

const at = (map: ReturnType<typeof layout>, key: string): PlacedCard => {
  const card = map.byKey.get(key);
  if (card === undefined) throw new Error(`no card ${key}`);
  return card;
};

const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.width &&
  b.x < a.x + a.width &&
  a.y < b.y + b.height &&
  b.y < a.y + a.height;

describe('layoutMindMap', () => {
  it('shows only the top Story while nothing is open', () => {
    const map = layout([]);
    expect(map.cards.map((card) => card.key)).toEqual(['top']);
    expect(at(map, 'top')).toMatchObject({
      x: 0,
      y: 0,
      ...closed,
    });
  });

  it('puts an open Story’s sub-Stories, and only those, in a column to its right', () => {
    const map = layout(['top']);
    const top = at(map, 'top');
    expect(top.children).toEqual(['top/a', 'top/b']);
    const column = top.children.map((key) => at(map, key));
    for (const card of column) expect(card.x).toBe(300 + 50);
    expect(column.map((card) => card.y)).toEqual(
      column.map((card) => card.y).sort((a, b) => a - b),
    );
  });

  it('centres the children on the card that opened them', () => {
    const map = layout(['top']);
    const top = at(map, 'top');
    const column = top.children.map((key) => at(map, key));
    const first = column[0]!;
    const last = column.at(-1)!;
    const middle = (first.y + last.y + last.height) / 2;
    expect(middle).toBeCloseTo(top.y + top.height / 2);
  });

  it('never overlaps two cards, however many branches are open', () => {
    for (const open of [
      ['top'],
      ['top', 'top/a'],
      ['top', 'top/a', 'top/b'],
      ['top', 'top/a', 'top/a/deep', 'top/b'],
    ]) {
      const { cards } = layout(open);
      for (const a of cards) {
        for (const b of cards) {
          if (a !== b)
            expect(overlaps(a, b), `${a.key} × ${b.key}`).toBe(false);
        }
      }
    }
  });

  it('pushes the next branch aside when one opens', () => {
    const before = at(layout(['top']), 'top/b');
    const after = at(layout(['top', 'top/a']), 'top/b');
    expect(after.y).toBeGreaterThan(before.y);
  });

  it('never makes a Proof a card', () => {
    const map = layout(['top', 'top/a', 'top/a/deep', 'top/b']);
    expect(map.cards.map((card) => card.key)).toEqual([
      'top',
      'top/a',
      'top/a/deep',
      'top/b',
    ]);
    expect(map.cards.every((card) => card.story.id === card.key)).toBe(true);
  });

  it('hides a closed Story’s children even when deeper Stories are open', () => {
    const map = layout(['top', 'top/a/deep']);
    expect(map.byKey.has('top/a/deep')).toBe(false);
  });

  it('is pure: the same input gives the same map', () => {
    expect(layout(['top', 'top/a'])).toEqual(layout(['top', 'top/a']));
  });

  it('bounds every card', () => {
    const map = layout(['top', 'top/a', 'top/b']);
    for (const card of map.cards) {
      expect(card.x).toBeGreaterThanOrEqual(map.bounds.x);
      expect(card.y).toBeGreaterThanOrEqual(map.bounds.y);
      expect(card.x + card.width).toBeLessThanOrEqual(
        map.bounds.x + map.bounds.width,
      );
      expect(card.y + card.height).toBeLessThanOrEqual(
        map.bounds.y + map.bounds.height,
      );
    }
  });

  it('caps every card at the widest a card may be', () => {
    const set = new Set(['top', 'top/a']);
    const spacing = { column: 50, row: 10, branch: 20 };
    const map = layoutMindMap(tree, set, sizes(set), spacing, 250);
    // Open cards narrow to the cap; closed ones are already narrower.
    expect(at(map, 'top').width).toBe(250);
    expect(at(map, 'top/a').width).toBe(250);
    expect(at(map, 'top/b').width).toBe(200);
    // The column beside a capped card moves in with it.
    expect(at(map, 'top/a').x).toBe(250 + 50);
    expect(at(map, 'top').height).toBe(opened.height);
  });
});

describe('familyRect', () => {
  it('boxes an open card with the sub-Stories it shows', () => {
    const map = layout(['top']);
    const top = at(map, 'top');
    const b = at(map, 'top/b');
    expect(familyRect(map, 'top')).toEqual({
      x: top.x,
      y: Math.min(top.y, at(map, 'top/a').y),
      width: b.x + b.width - top.x,
      height:
        Math.max(top.y + top.height, b.y + b.height) -
        Math.min(top.y, at(map, 'top/a').y),
    });
  });

  it('boxes a collapsed card alone', () => {
    const map = layout([]);
    const { x, y, width, height } = at(map, 'top');
    expect(familyRect(map, 'top')).toEqual({ x, y, width, height });
  });
});
