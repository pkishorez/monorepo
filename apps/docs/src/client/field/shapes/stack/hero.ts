import { Kind } from '../pen/index.ts';
import type { Cloud } from '../pen/index.ts';
import { TAU, circle, gauss, stroke } from '../pen/index.ts';

/*
 * hero: the whole stack as one world. A globe drawn in fine latitude bands,
 * a thin ring round its waist, and a few lights glinting on its face.
 */

export function hero(c: Cloud): void {
  const { n, random } = c;
  const radius = 0.68;

  // Bands, each with points in step with its length, so all read as even.
  const bands = 23;
  const globe = n * 0.6;
  const lats = Array.from(
    { length: bands },
    (_, k) => -Math.PI / 2 + (Math.PI * (k + 0.5)) / bands,
  );
  const weight = lats.reduce((sum, lat) => sum + Math.cos(lat), 0);
  for (const lat of lats) {
    const r = Math.cos(lat) * radius;
    const y = Math.sin(lat) * radius;
    stroke(
      c,
      (globe * Math.cos(lat)) / weight,
      circle([0, y, 0], r, 'xz'),
      0.85,
    );
  }

  // Lights on its face: the packages, glinting.
  for (let k = 0; k < n * 0.012; k++) {
    const lat = Math.asin(random() * 2 - 1);
    const lon = random() * TAU;
    const r = Math.cos(lat) * radius * 1.01;
    c.add(
      [Math.cos(lon) * r, Math.sin(lat) * radius * 1.01, Math.sin(lon) * r],
      2.2,
      [Kind.twinkle, random(), 0.8 + random() * 1.4, 0, 0],
    );
  }

  // The ring: a fine line, and a soft band of dust beside it.
  stroke(c, n * 0.08, circle([0, 0, 0], 0.98, 'xz'), 0.9);
  for (let k = 0; k < n * 0.13; k++) {
    const a = random() * TAU;
    const r = 1.06 + Math.abs(gauss(random)) * 0.05;
    c.add([Math.cos(a) * r, gauss(random) * 0.006, Math.sin(a) * r], 0.45, [
      Kind.twinkle,
      random(),
      0.5 + random(),
      0,
      0,
    ]);
  }
}
