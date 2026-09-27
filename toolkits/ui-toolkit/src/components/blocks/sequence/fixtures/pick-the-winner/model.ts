/**
 * Data model for the pick-the-winner demo: the persistent item set plus the two
 * paint values (background colour + box-shadow) the scene animates between.
 * Pure data — no JSX — so the lineup and crown scenes share one source of truth.
 */

/** The persistent item set. Every square keeps its id (`layoutId`) across steps. */
export const ITEMS = Array.from({ length: 10 }, (_, i) => `item-${i}`);

/** Background colours: the highlighted winner vs. every resting item. */
export const itemColor = {
  winner: '#f59e0b',
  rest: '#64748b',
} as const;

/** Box-shadows paired with the colours above. */
export const itemShadow = {
  winner:
    '0 0 0 3px rgba(245,158,11,0.45), 0 8px 22px -8px rgba(245,158,11,0.5)',
  rest: '0 6px 16px -8px rgba(15,23,42,0.45)',
} as const;
