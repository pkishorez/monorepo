import type { Spot } from './placement.ts';
import { blendOf } from './scroll.ts';

/*
 * The comet, for the journey: a bright head that follows the reader down
 * the page. Formed at a Chapter it circles that Chapter's shape, passing in
 * front and behind; between Chapters it swoops across in an arc, out
 * towards the reader and back. Its place is a pure function of the scroll
 * and the clock. Its trail is the path it has drawn, smoothed, kept up to
 * a length and no older than a moment: held at a shape it traces the
 * orbit behind it; on the move it shows the arc it came along.
 */

export type Comet = {
  /** x, y, z and how bright, 0..1. */
  readonly head: [number, number, number, number];
  /**
   * The trail as a ribbon, head first, two vertices per sample: x, y, z,
   * age 0..1, then a neighbour's x, y, z and which side, ±1.
   */
  readonly ribbon: Float32Array;
  /** Vertices in the ribbon. */
  ribbonCount: number;
  readonly step: (input: {
    readonly t: number;
    readonly time: number;
    readonly dt: number;
    readonly spots: readonly Spot[];
    readonly aspect: number;
    readonly on: boolean;
  }) => void;
};

/** Samples along the ribbon. */
const SAMPLES = 160;
/** Places kept, each at least STEP apart. */
const KEEP = 2048;
const STEP = 0.004;
/**
 * Seconds a piece of trail stays whole, and by when it has faded out
 * however long the path: a fling's long straight run is gone quickly,
 * while the slow circle round a shape keeps its tail.
 */
const FRESH = 0.4;
const OLDEST = 1.8;

const catmull = (a: number, b: number, c: number, d: number, u: number) =>
  0.5 *
  (2 * b +
    (-a + c) * u +
    (2 * a - 5 * b + 4 * c - d) * u * u +
    (-a + 3 * b - 3 * c + d) * u * u * u);

/** Where the comet is at progress `t` and clock `time`. */
function path(
  t: number,
  time: number,
  spots: readonly Spot[],
  aspect: number,
): [number, number, number] {
  const last = spots.length - 1;
  const k = Math.min(Math.floor(t), Math.max(last - 1, 0));
  const u = blendOf(Math.min(Math.max(t - k, 0), 1));
  const at = (i: number) => spots[Math.min(Math.max(i, 0), last)]!;
  const [p0, p1, p2, p3] = [at(k - 1), at(k), at(k + 1), at(k + 2)];
  const cx = catmull(p0.x, p1.x, p2.x, p3.x, u);
  const cy = catmull(p0.y, p1.y, p2.y, p3.y, u);
  const scale = p1.scale + (p2.scale - p1.scale) * u;

  // Across the page it arcs up and over; when the next shape sits in the
  // same place, as on a phone, it tightens its circle and swings out to one
  // side and back instead, staying on screen.
  const arc = Math.sin(Math.PI * u);
  const across = Math.min(Math.abs(p2.x - p1.x) / 0.3, 1);
  const swing = (k % 2 === 0 ? 1 : -1) * aspect * 0.3;

  // Round the shape on a tilted ellipse.
  const a = time * 0.5;
  const r = scale * 0.98 * (1 - 0.55 * arc * (1 - across));
  const ox = Math.cos(a) * r;
  const oy = Math.sin(a) * r * 0.3;
  const oz = Math.sin(a) * r * 0.8;
  const lean = -0.32;
  return [
    cx + ox * Math.cos(lean) - oy * Math.sin(lean) + arc * swing * (1 - across),
    cy + ox * Math.sin(lean) + oy * Math.cos(lean) + arc * 0.22 * across,
    oz + arc * (0.25 + 0.25 * across),
  ];
}

export function comet(): Comet {
  // The path drawn so far, newest last: a ring of x, y, z and when.
  const kept = new Float64Array(KEEP * 4);
  let written = 0;
  let clock = 0;
  const place = (i: number) => ((written - 1 - i + KEEP * 4) % KEEP) * 4;

  const self: Comet = {
    head: [0, 0, 0, 0],
    ribbon: new Float32Array(SAMPLES * 2 * 8),
    ribbonCount: 0,
    step({ t, time, dt, spots, aspect, on }) {
      clock += dt;
      const strength =
        self.head[3] +
        ((on ? 1 : 0) - self.head[3]) * (1 - Math.exp(-dt * 2.5));
      self.head[3] = strength < 0.002 ? 0 : strength;
      if (self.head[3] === 0) {
        written = 0;
        self.ribbonCount = 0;
        return;
      }

      const [x, y, z] = path(t, time, spots, aspect);
      self.head[0] = x;
      self.head[1] = y;
      self.head[2] = z;
      const o = written > 0 ? place(0) : -1;
      if (
        o < 0 ||
        Math.hypot(x - kept[o]!, y - kept[o + 1]!, z - kept[o + 2]!) > STEP
      ) {
        const n = (written % KEEP) * 4;
        kept.set([x, y, z, clock], n);
        written++;
      }
      ribbon(Math.max(aspect, 1) * 1.05);
    },
  };

  /**
   * The path behind the head as a smooth line: a Catmull-Rom curve through
   * the places kept, so a fast fling's few far-apart places bend round
   * instead of meeting in corners. Each point is x, y, z and its age in
   * seconds; it stops at `length`, or where the path is too old to show.
   */
  function smoothed(length: number): number[] {
    const held = Math.min(written, KEEP);
    const at = (i: number): readonly [number, number, number, number] => {
      if (i <= 0) return [self.head[0], self.head[1], self.head[2], clock];
      const o = place(Math.min(i - 1, held - 1));
      return [kept[o]!, kept[o + 1]!, kept[o + 2]!, kept[o + 3]!];
    };
    const line: number[] = [self.head[0], self.head[1], self.head[2], 0];
    let walked = 0;
    for (let j = 0; j < held && walked < length; j++) {
      const [p0, p1, p2, p3] = [at(j - 1), at(j), at(j + 1), at(j + 2)];
      if (clock - p2[3] > OLDEST + 0.2) break;
      const d = Math.hypot(p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]);
      const steps = Math.min(16, Math.max(1, Math.ceil(d / 0.01)));
      for (let k = 1; k <= steps; k++) {
        const u = k / steps;
        const x = catmull(p0[0], p1[0], p2[0], p3[0], u);
        const y = catmull(p0[1], p1[1], p2[1], p3[1], u);
        const z = catmull(p0[2], p1[2], p2[2], p3[2], u);
        const n = line.length;
        walked += Math.hypot(
          x - line[n - 4]!,
          y - line[n - 3]!,
          z - line[n - 2]!,
        );
        line.push(x, y, z, clock - (p1[3] + (p2[3] - p1[3]) * u));
      }
    }
    return line;
  }

  /** Resamples the smooth path, evenly by length, into the ribbon. */
  function ribbon(length: number): void {
    const line = smoothed(length);
    const step = length / (SAMPLES - 1);
    // x, y, z, age 0..1: by length, or by time, whichever is older.
    const samples: number[] = [line[0]!, line[1]!, line[2]!, 0];
    let walked = 0;
    let want = step;
    for (let i = 4; i < line.length && samples.length < SAMPLES * 4; i += 4) {
      const [px, py, pz, pt] = [
        line[i - 4]!,
        line[i - 3]!,
        line[i - 2]!,
        line[i - 1]!,
      ];
      const [qx, qy, qz, qt] = [
        line[i]!,
        line[i + 1]!,
        line[i + 2]!,
        line[i + 3]!,
      ];
      const d = Math.hypot(qx - px, qy - py, qz - pz);
      while (d > 0 && walked + d >= want && samples.length < SAMPLES * 4) {
        const f = (want - walked) / d;
        const seconds = pt + (qt - pt) * f;
        const byTime = Math.min(
          Math.max((seconds - FRESH) / (OLDEST - FRESH), 0),
          1,
        );
        const age = Math.max(want / length, byTime);
        samples.push(
          px + (qx - px) * f,
          py + (qy - py) * f,
          pz + (qz - pz) * f,
          age,
        );
        want += step;
        if (age >= 1) break;
      }
      walked += d;
      if (samples[samples.length - 1]! >= 1) break;
    }
    const count = samples.length / 4;
    if (count < 2) {
      self.ribbonCount = 0;
      return;
    }
    const out = self.ribbon;
    for (let s = 0; s < count; s++) {
      // A neighbour gives the ribbon its direction; the last looks back,
      // so its sides swap to keep the strip untwisted.
      const back = s === count - 1;
      const nb = back ? s - 1 : s + 1;
      for (const side of [-1, 1]) {
        out.set(
          [
            samples[s * 4]!,
            samples[s * 4 + 1]!,
            samples[s * 4 + 2]!,
            samples[s * 4 + 3]!,
            samples[nb * 4]!,
            samples[nb * 4 + 1]!,
            samples[nb * 4 + 2]!,
            back ? -side : side,
          ],
          (s * 2 + (side + 1) / 2) * 8,
        );
      }
    }
    self.ribbonCount = count * 2;
  }

  return self;
}
