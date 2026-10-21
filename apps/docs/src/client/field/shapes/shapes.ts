import { cloud } from './pen/index.ts';
import type { Baked, Cloud, V3 } from './pen/index.ts';
import {
  actor,
  compose,
  drift,
  lineage,
  mark,
  renders,
  rewind,
  states,
} from './kabuki/index.ts';
import {
  ai,
  auth,
  hero,
  kabuki,
  laymos,
  lotel,
  monoverse,
  outro,
  parts,
  rpc,
  std,
  web,
} from './stack/index.ts';
import { dust } from './pen/index.ts';

/*
 * Every named shape, in two families: the stack's, for the home page, and
 * kabuki's, for its own landing page. And how to bake one: draw it into a Cloud of exactly
 * the field's point count, fill what it left with dust, then order its
 * points by where they sit, so point i of one shape and point i of the next
 * are near each other and a morph flows across instead of scrambling.
 */

/** How a shape is held on screen: turned, tilted, tinted. */
export type Look = {
  /** Turns per second round its own upright axis, in radians. */
  readonly spin: number;
  /** How far it sways from side to side instead, in radians. */
  readonly sway: number;
  /** Tipped towards the reader, in radians. */
  readonly tilt: number;
  /** Leaning sideways, in radians. */
  readonly roll: number;
  /** A faint colour on white: kept close to grey. */
  readonly tint: V3;
  /** How bright the dust round it is. */
  readonly dust: number;
  /** How much of the field is dust, 0..1. */
  readonly haze: number;
};

type Shape = { readonly draw: (c: Cloud) => void; readonly look: Look };

const look = (l: Partial<Look>): Look => ({
  spin: 0,
  sway: 0.3,
  tilt: 0.1,
  roll: 0,
  tint: [1, 1, 1],
  dust: 0.2,
  haze: 0.12,
  ...l,
});

const SHAPES = {
  // The stack, one shape per package.
  hero: {
    draw: hero,
    look: look({ spin: 0.08, sway: 0, tilt: 0.4, roll: -0.16, dust: 0.22 }),
  },
  kabuki: {
    draw: kabuki,
    look: look({ spin: 0.12, sway: 0, tilt: 0.24, tint: [1, 0.96, 0.9] }),
  },
  std: {
    draw: std,
    look: look({ sway: 0.32, tilt: 0.12, tint: [0.92, 0.98, 1] }),
  },
  rpc: {
    draw: rpc,
    look: look({ sway: 0.45, tilt: 0.2, tint: [0.92, 0.95, 1] }),
  },
  auth: {
    draw: auth,
    look: look({ sway: 0.38, tilt: 0.08, tint: [1, 0.97, 0.9] }),
  },
  ai: {
    draw: ai,
    look: look({ sway: 0.4, tilt: 0.18, tint: [0.93, 1, 0.97] }),
  },
  web: {
    draw: web,
    look: look({ sway: 0.3, tilt: 0.06, tint: [0.94, 0.97, 1] }),
  },
  lotel: {
    draw: lotel,
    look: look({ sway: 0.22, tilt: 0.12, tint: [1, 0.95, 0.9] }),
  },
  laymos: {
    draw: laymos,
    look: look({ spin: 0.09, sway: 0, tilt: 0.46, tint: [0.94, 0.97, 1] }),
  },
  monoverse: {
    draw: monoverse,
    look: look({ spin: 0.06, sway: 0, tilt: 0.22, dust: 0.26 }),
  },
  parts: {
    draw: parts,
    look: look({ sway: 0.25, tilt: 0.08, tint: [0.96, 1, 0.94] }),
  },
  outro: {
    draw: outro,
    look: look({ sway: 0.12, tilt: 0.3, dust: 0.1, haze: 0.3 }),
  },

  // kabuki, one shape per idea.
  drift: { draw: drift, look: look({ sway: 0, tilt: 0, haze: 0 }) },
  actor: { draw: actor, look: look({ sway: 0.35, tilt: 0.14 }) },
  states: { draw: states, look: look({ sway: 0.3, tilt: 0.1 }) },
  compose: { draw: compose, look: look({ sway: 0.32, tilt: 0.08 }) },
  renders: { draw: renders, look: look({ sway: 0.28, tilt: 0.16 }) },
  rewind: { draw: rewind, look: look({ sway: 0.25, tilt: 0.12 }) },
  lineage: { draw: lineage, look: look({ sway: 0.3, tilt: 0.06 }) },
  mark: { draw: mark, look: look({ sway: 0.22, tilt: 0.05, haze: 0.1 }) },
} as const satisfies Record<string, Shape>;

export type ShapeName = keyof typeof SHAPES;

/** Every shape, in the order the field bakes them. */
export const SHAPE_NAMES = Object.keys(SHAPES) as ShapeName[];

/** The shape named, or the hero for a name it does not know. */
export function shapeOf(name: string | undefined): ShapeName {
  return name !== undefined && name in SHAPES ? (name as ShapeName) : 'hero';
}

export function lookOf(name: ShapeName): Look {
  return SHAPES[name].look;
}

/**
 * One shape's `n` points, ordered for a flowing morph. Each shape draws by
 * shares of `n`; it is drawn once to count, then again scaled so it fills
 * all but its haze, whatever it asked for.
 */
export function bake(name: ShapeName, n: number): Baked {
  const shape: Shape = SHAPES[name];
  const seed = SHAPE_NAMES.indexOf(name) * 7919 + 17;
  const probe = cloud(n, seed, n * 4);
  shape.draw(probe.cloud);
  const used = probe.take().count;
  const drawn = cloud((n * n * (1 - shape.look.haze)) / used, seed, n);
  shape.draw(drawn.cloud);
  dust(drawn.cloud, drawn.cloud.left(), 1.35, shape.look.dust);
  const { pos, aux } = drawn.take();

  // One sweep across: by x, a little by y and depth, a touch of noise.
  const random = drawn.cloud.random;
  const keys = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    keys[i] =
      pos[o]! +
      pos[o + 1]! * 0.3 +
      pos[o + 2]! * 0.15 +
      (random() - 0.5) * 0.12;
  }
  const order = Array.from({ length: n }, (_, i) => i).sort(
    (a, b) => keys[a]! - keys[b]!,
  );
  const sortedPos = new Float32Array(n * 4);
  const sortedAux = new Float32Array(n * 4);
  order.forEach((from, to) => {
    sortedPos.set(pos.subarray(from * 4, from * 4 + 4), to * 4);
    sortedAux.set(aux.subarray(from * 4, from * 4 + 4), to * 4);
  });
  return { pos: sortedPos, aux: sortedAux };
}
