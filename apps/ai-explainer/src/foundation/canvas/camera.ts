import { ease, glide, mix } from './time.ts';

export type Shot = { x: number; y: number; scale: number };
export type CameraKey = Shot & { at: number; seconds?: number };

// Keys run in order; each glides from wherever the previous one left off.
// Between keys the camera holds perfectly still: sub-pixel drift on a resting
// frame reads as jitter.
export function camera(frame: number, keys: CameraKey[]): Shot {
  let shot: Shot = keys[0]!;
  for (const key of keys.slice(1)) {
    const t = ease(frame, key.at, key.seconds ?? 1, glide);
    shot = {
      x: mix(shot.x, key.x, t),
      y: mix(shot.y, key.y, t),
      scale: mix(shot.scale, key.scale, t),
    };
  }
  return shot;
}
