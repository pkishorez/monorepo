/**
 * How the Laymo stacks: one layer per nesting level. A line at rest joins
 * two cards at one level, so it lies above the card holding them and below
 * every card at their level, open ones included: a line between two cards
 * passes behind an open sibling, and the lines inside it show over its
 * ground. A line the focus lights rises above everything.
 */
export const laymoLayers = {
  card: (depth: number): number => 10 * depth + 5,
  line: (lit: boolean, depth: number): number =>
    lit ? 100_000 : 10 * depth + 2,
} as const;
