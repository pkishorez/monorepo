import { Kind, moving, travelled } from '../pen/index.ts';
import type { Clock, Cloud, Motion, V3 } from '../pen/index.ts';

/*
 * A Marker: one bright thing that goes round a loop of places on the story
 * clock, waiting at each and moving on to the next. It is drawn once per
 * place, each copy shown from when the marker arrives there until it has
 * moved on to the next, where the next copy takes over, so it reads as one
 * thing. Where it is now is worked out the same way for its words.
 */

export type Place = {
  readonly at: V3;
  /** When the marker has arrived here, on the story clock. */
  readonly arrive: number;
  /** How long the move here takes, on the story clock. */
  readonly move: number;
};

const fract = (x: number) => x - Math.floor(x);

const legs = (places: readonly Place[]) =>
  places.map((here, k) => {
    const next = places[(k + 1) % places.length]!;
    return {
      at: here.at,
      start: here.arrive,
      length: fract(next.arrive - here.arrive),
      move: next.move,
      by: [next.at[0] - here.at[0], next.at[1] - here.at[1]] as const,
    };
  });

/**
 * Draws the marker at each place, with `draw`, given where and how it
 * moves. `kind` is `Kind.glide` for a straight move, `Kind.travel` to arc.
 */
export function marker(
  c: Cloud,
  places: readonly Place[],
  draw: (c: Cloud, at: V3, motion: Motion) => void,
  kind: number = Kind.glide,
): void {
  for (const leg of legs(places))
    draw(c, leg.at, moving(kind, leg.start, leg.by, leg.length, leg.move));
}

/** Where the marker is now. (shader: `Kind.glide`, `Kind.travel`) */
export function markerAt(
  clock: Clock,
  places: readonly Place[],
  kind: number = Kind.glide,
): V3 {
  let best = legs(places)[0]!;
  let shown = -1;
  let way = 0;
  for (const leg of legs(places)) {
    const { on, s } = travelled(clock, leg.start, leg.length, leg.move, kind);
    if (on > shown) {
      shown = on;
      best = leg;
      way = s;
    }
  }
  const arc =
    kind === Kind.travel ? best.by[0] * 0.3 * Math.sin(Math.PI * way) : 0;
  return [
    best.at[0] + best.by[0] * way,
    best.at[1] + best.by[1] * way + arc,
    best.at[2],
  ];
}
