import type { MindMap } from './mind-map-layout';

/** The Actions that walk the shown tree. */
export type Walk = 'parent' | 'firstChild' | 'nextSibling' | 'previousSibling';

/**
 * What a walk does to the focused card: `focus` moves focus to another shown
 * card and opens or closes nothing; `toggle` opens `key` and moves focus to
 * `focus`.
 */
export type FocusStep =
  | { readonly kind: 'focus'; readonly key: string }
  | { readonly kind: 'toggle'; readonly key: string; readonly focus: string };

/**
 * Walks the shown tree from the focused card `key`. `firstChild` opens a
 * closed card with sub-Stories first. Undefined when the walk goes nowhere.
 */
export function walkFocus(
  map: MindMap,
  key: string,
  walk: Walk,
): FocusStep | undefined {
  const card = map.byKey.get(key);
  if (card === undefined) return undefined;
  const to = (next: string | null | undefined): FocusStep | undefined =>
    next == null || !map.byKey.has(next)
      ? undefined
      : { kind: 'focus', key: next };
  const siblings =
    card.parentKey === null
      ? [key]
      : (map.byKey.get(card.parentKey)?.children ?? [key]);
  const at = siblings.indexOf(key);

  switch (walk) {
    case 'firstChild': {
      if (card.children.length > 0) return to(card.children[0]);
      const first = card.story.stories[0];
      return first === undefined
        ? undefined
        : { kind: 'toggle', key, focus: first.id };
    }
    case 'parent':
      return to(card.parentKey);
    case 'previousSibling':
      return to(siblings[at - 1]);
    case 'nextSibling':
      return to(siblings[at + 1]);
  }
}
