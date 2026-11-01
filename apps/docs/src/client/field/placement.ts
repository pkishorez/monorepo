import type { Side } from './chapters.ts';

/*
 * Where a shape sits on screen. The world is measured so the screen is 2
 * units tall and `2 × aspect` wide at depth 0. On a wide screen a shape
 * takes the half its Chapter's side names, or the middle; on a narrow one it
 * always sits centred above the words, which take the bottom of the screen.
 */

export type Spot = {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
};

export const WIDE = 1024;

/**
 * On a narrow screen, the room a shape has, in CSS pixels from the top:
 * between the header and where the words are read, the bottom of card.ts's
 * `glass`: 55% down a tall screen, higher on a short one so the words keep
 * 23.75rem, never above 40%.
 */
export function room(height: number): { top: number; bottom: number } {
  return {
    top: 64,
    bottom: Math.max(0.4 * height, Math.min(0.55 * height, height - 380)),
  };
}

export function place(side: Side, width: number, height: number): Spot {
  const aspect = width / height;
  if (width < WIDE) {
    const { top, bottom } = room(height);
    return {
      x: 0,
      y: 1 - (top + bottom) / height,
      scale: Math.min(0.42, aspect * 0.8, ((bottom - top) / height) * 0.9),
    };
  }
  if (side === 'center') {
    return { x: 0, y: 0, scale: Math.min(0.74, aspect * 0.55) };
  }
  const half = aspect / 2;
  return {
    x: side === 'right' ? half : -half,
    y: 0,
    scale: Math.min(0.6, half * 0.7),
  };
}
