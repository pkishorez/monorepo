import type { Track } from '../recognizers';

// How long a trail point stays, and how long a lifted pointer takes to fade.
const TRAIL_MS = 600;
const FADE_MS = 500;

type Point = { readonly x: number; readonly y: number; readonly t: number };

export type Trail = {
  readonly id: number;
  readonly points: ReadonlyArray<Point>;
  /** 1 while down, falling to 0 as a lifted pointer fades. */
  readonly opacity: number;
};

/** Each pointer's recent path, sampled once per painted frame. */
export const createTrails = () => {
  const trails = new Map<number, { points: Array<Point>; liftedAt?: number }>();

  return {
    record: (pointers: ReadonlyArray<Track>, now: number) => {
      const down = new Set<number>();
      for (const pointer of pointers) {
        down.add(pointer.id);
        const trail = trails.get(pointer.id) ?? { points: [] };
        trail.liftedAt = undefined;
        const last = trail.points.at(-1);
        const { x, y } = pointer.current;
        if (last === undefined || last.x !== x || last.y !== y) {
          trail.points.push({ x, y, t: now });
        }
        trails.set(pointer.id, trail);
      }
      for (const [id, trail] of trails) {
        if (!down.has(id)) trail.liftedAt ??= now;
      }
    },
    /** What to draw at `now`; drops what has faded. */
    visible: (now: number): ReadonlyArray<Trail> => {
      const out: Array<Trail> = [];
      for (const [id, trail] of trails) {
        const fade =
          trail.liftedAt === undefined
            ? 1
            : 1 - (now - trail.liftedAt) / FADE_MS;
        if (fade <= 0) {
          trails.delete(id);
          continue;
        }
        while (trail.points.length > 1 && now - trail.points[0].t > TRAIL_MS) {
          trail.points.shift();
        }
        out.push({ id, points: trail.points, opacity: fade });
      }
      return out;
    },
    /** Whether anything is still moving, so another frame is needed. */
    animating: () => trails.size > 0,
  };
};
