import { Kind } from '../pen/index.ts';
import type { Cloud, V3 } from '../pen/index.ts';
import {
  ball,
  bend,
  circle,
  length3,
  lerp3,
  scale3,
  stroke,
  sub3,
} from '../pen/index.ts';

/*
 * monoverse: the map of the monorepo. Every package a star, the bigger ones
 * nearer the middle, and a faint link for every package that leans on
 * another, a pulse now and then crossing it: a galaxy of dependencies.
 */

const PACKAGES = [
  'kabuki',
  'std-toolkit',
  'rpc-toolkit',
  'auth-toolkit',
  'ai-toolkit',
  'web-platform',
  'lotel',
  'laymos',
  'monoverse',
  'use-keys',
  'use-gesture',
  'use-effect-ts',
  'effect-webrtc',
  'effect-tracer',
] as const;

type Package = (typeof PACKAGES)[number];

const LINKS: ReadonlyArray<readonly [Package, Package]> = [
  ['web-platform', 'kabuki'],
  ['kabuki', 'std-toolkit'],
  ['kabuki', 'rpc-toolkit'],
  ['std-toolkit', 'rpc-toolkit'],
  ['auth-toolkit', 'rpc-toolkit'],
  ['auth-toolkit', 'std-toolkit'],
  ['ai-toolkit', 'rpc-toolkit'],
  ['ai-toolkit', 'kabuki'],
  ['lotel', 'effect-tracer'],
  ['lotel', 'web-platform'],
  ['monoverse', 'laymos'],
  ['monoverse', 'web-platform'],
  ['use-keys', 'web-platform'],
  ['use-gesture', 'web-platform'],
  ['use-effect-ts', 'kabuki'],
  ['effect-webrtc', 'rpc-toolkit'],
];

/** Where each package sits: the first six close in, the rest further out. */
function places(): Map<Package, V3> {
  const map = new Map<Package, V3>();
  const golden = Math.PI * (3 - Math.sqrt(5));
  PACKAGES.forEach((name, k) => {
    if (k === 0) return void map.set(name, [0, 0.04, 0]);
    const inner = k < 6;
    const count = inner ? 5 : 8;
    const i = inner ? k - 1 : k - 6;
    const y = 1 - ((i + 0.5) / count) * 2;
    const r = Math.sqrt(1 - y * y);
    const a = i * golden + (inner ? 0.3 : 1.1);
    const radius = inner ? 0.46 : 0.84;
    map.set(name, scale3([Math.cos(a) * r, y * 0.8, Math.sin(a) * r], radius));
  });
  return map;
}

export function monoverse(c: Cloud): void {
  const { n } = c;
  const at = places();

  PACKAGES.forEach((name, k) => {
    const size = k === 0 ? 1.4 : k < 6 ? 1 : 0.65;
    const p = at.get(name)!;
    ball(c, n * 0.007 * size, p, 0.04 * size, 0.95);
    stroke(c, n * 0.008 * size, circle(p, 0.085 * size, 'xz'), 0.6);
  });

  LINKS.forEach(([a, b], e) => {
    const from = at.get(a)!;
    const to = at.get(b)!;
    const via = scale3(lerp3(from, to, 0.5), 1.18);
    const len = length3(sub3(to, from));
    stroke(
      c,
      n * 0.022 * len,
      bend(from, via, to),
      0.38,
      (u) => [Kind.pulse, (e * 0.618) % 1, u, 0.13, 0.05],
      0.003,
    );
  });
}
