/*
 * A Cloud: the points of one shape, written straight into the two rows of
 * numbers the GPU reads. Each point has a place, a brightness and a Motion:
 * how it moves or shines over time once the shape is formed. A shape asks
 * for a share of the Cloud's points; whatever it leaves is filled with dust.
 */

export type V3 = [number, number, number];

/** What a point does over time; the shader reads the number. */
export const Kind = {
  still: 0,
  /** The point travels from its place by `[dx, dy, dz]`, over and over. */
  flow: 2,
  /** The point turns round the shape's z axis: `[radians per second]`. */
  orbit: 4,
  /** The point glints: `[speed]`. */
  twinkle: 5,
  /**
   * The point lights in its turn, once a loop: `[start, length, seconds a
   * loop]`, starts and lengths in 0..1 of the loop. Its phase picks how: 0
   * glows while on, 0.5 flashes once and fades, 0.9 dims while on.
   */
  cycle: 6,
  /**
   * Drawn in along a path in its turn on the story clock, then dissolved:
   * `[u along it, start, length]`; its phase is how faintly it shows when
   * not drawn.
   */
  reveal: 8,
  /**
   * A Message runs along a path, a bright head with a fading tail behind
   * it: `[s along it, laps per second, width]`.
   */
  message: 11,
  /**
   * The point flares as a Message lands on it, then settles: `[s where it
   * lands, laps per second, how long it glows, in laps]`.
   */
  arrive: 12,
  /**
   * A Message on its way: shown for its window on the story clock, it
   * holds, then flies by `[dx, dy]` at the window's end, leaving fast and
   * slowing into where it lands, arcing up when it goes right and down
   * when it goes left. Build it with `moving` in clock.ts.
   */
  travel: 13,
  /** As `travel`, in a straight line that eases out and brakes in: a marker. */
  glide: 14,
  /**
   * Formed for its window on the story clock, `[length, how far]`: it
   * gathers in fast from all round, a touch past its place and back, and
   * scatters faster still when the window ends. Its phase is when.
   */
  gather: 15,
  /**
   * Pops, `repeats` times a loop from its phase: swells round `[x, y]`
   * and brightens, up fast and down slowly. Build it with `popping`.
   */
  pop: 16,
  /** A ring running out from `[x, y]` as a pop goes off. Build it with `rippling`. */
  ripple: 17,
  /**
   * Light runs along a line, `[u along it, how long it takes, repeats]`
   * on the story clock from its phase, easing in and out.
   */
  stream: 18,
} as const;

/** One loop of the story clock the kabuki shapes keep time by, in seconds. */
export const STORY = 9;

export type Motion = readonly [
  kind: number,
  phase: number,
  a: number,
  b: number,
  c: number,
];

export const STILL: Motion = [Kind.still, 0, 0, 0, 0];

export type Cloud = {
  /** How many points the shape has, in all. */
  readonly n: number;
  readonly random: () => number;
  /** How many are not placed yet. */
  readonly left: () => number;
  readonly add: (p: V3, bright?: number, motion?: Motion) => void;
};

export type Baked = {
  /** x, y, z, brightness per point. */
  readonly pos: Float32Array;
  /** kind + phase, then the Motion's three numbers, per point. */
  readonly aux: Float32Array;
};

/** A seeded random in [0, 1): the same shape every time. */
export function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * An empty Cloud of room for `room` points, telling shapes it has `n`, and a
 * way to take what was drawn.
 */
export function cloud(
  n: number,
  seed: number,
  room = n,
): { readonly cloud: Cloud; readonly take: () => Baked & { count: number } } {
  const pos = new Float32Array(room * 4);
  const aux = new Float32Array(room * 4);
  const random = seeded(seed);
  let i = 0;
  const add = (p: V3, bright = 1, motion: Motion = STILL) => {
    if (i >= room) return;
    const o = i * 4;
    pos[o] = p[0];
    pos[o + 1] = p[1];
    pos[o + 2] = p[2];
    pos[o + 3] = bright;
    // The phase rides in the kind's fraction, so a texel holds it all.
    const phase = motion[1] - Math.floor(motion[1]);
    aux[o] = motion[0] + Math.min(phase, 0.999);
    aux[o + 1] = motion[2];
    aux[o + 2] = motion[3];
    aux[o + 3] = motion[4];
    i++;
  };
  return {
    cloud: { n, random, left: () => room - i, add },
    take: () => ({ pos, aux, count: i }),
  };
}

/** The same Cloud, but every point added is moved by `place` first. */
export function moved(c: Cloud, place: (p: V3) => V3): Cloud {
  return { ...c, add: (p, bright, motion) => c.add(place(p), bright, motion) };
}
