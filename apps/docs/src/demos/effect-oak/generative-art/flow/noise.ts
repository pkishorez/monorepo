/*
 * 2D Perlin noise and its fractal sum, as in Foldkit's example: the same
 * input always gives the same output, and nearby inputs give nearby outputs.
 */

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const gradientAngle = (ix: number, iy: number) => {
  const seeded = (ix * 374761393 + iy * 668265263) | 0;
  const mixed = ((seeded ^ (seeded >>> 13)) * 1274126177) | 0;
  const avalanched = (mixed ^ (mixed >>> 16)) >>> 0;
  return (avalanched / 0x100000000) * Math.PI * 2;
};

const dotGradient = (ix: number, iy: number, dx: number, dy: number) => {
  const angle = gradientAngle(ix, iy);
  return Math.cos(angle) * dx + Math.sin(angle) * dy;
};

const perlin2 = (x: number, y: number) => {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const u = fade(fx);
  const v = fade(fy);
  return lerp(
    lerp(dotGradient(x0, y0, fx, fy), dotGradient(x0 + 1, y0, fx - 1, fy), u),
    lerp(
      dotGradient(x0, y0 + 1, fx, fy - 1),
      dotGradient(x0 + 1, y0 + 1, fx - 1, fy - 1),
      u,
    ),
    v,
  );
};

/** `octaves` of Perlin noise summed, each `lacunarity` times finer and `persistence` times fainter; about -1 to 1. */
export const fractalNoise = (
  x: number,
  y: number,
  octaves: number,
  persistence: number,
  lacunarity: number,
) => {
  let total = 0;
  let weight = 0;
  let amplitude = 1;
  let frequency = 1;
  for (let octave = 0; octave < octaves; octave++) {
    total += perlin2(x * frequency, y * frequency) * amplitude;
    weight += amplitude;
    amplitude *= persistence;
    frequency *= lacunarity;
  }
  return total / weight;
};
