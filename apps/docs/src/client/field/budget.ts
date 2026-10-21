/*
 * How much the field may spend: how many particles, laid out as rows of a
 * texture, and how sharp to draw them. Phones get fewer and a softer pixel
 * ratio; if frames still run slow, the Governor lowers the pixel ratio.
 */

export type Budget = {
  /** Texture width; particles are `width × rows`. */
  readonly width: number;
  readonly rows: number;
  readonly dpr: number;
  readonly small: boolean;
};

const WIDTH = 512;

export function budget(): Budget {
  const small =
    window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 768;
  const big = window.innerWidth * window.innerHeight > 2_400_000;
  const rows = small ? 28 : big ? 96 : 80;
  const dpr = Math.min(window.devicePixelRatio || 1, small ? 1.75 : 2);
  return { width: WIDTH, rows, dpr, small };
}

/** Watches frame times; says when to draw at a lower pixel ratio. */
export function governor(start: number): (dt: number) => number {
  let dpr = start;
  let slow = 0;
  let frames = 0;
  return (dt) => {
    frames++;
    // The first second is busy with baking; judge after it.
    if (frames < 60) return dpr;
    slow = dt > 1 / 40 ? slow + 1 : Math.max(0, slow - 1);
    if (slow > 45 && dpr > 1) {
      dpr = Math.max(1, dpr * 0.8);
      slow = 0;
    }
    return dpr;
  };
}
