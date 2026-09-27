import type { Finger } from '../../engine';

type FingerRole = Finger['role'];

// How long a lifted finger takes to fade.
const FADE_MS = 280;

type Point = { readonly x: number; readonly y: number; readonly t: number };

export type Trail = {
  readonly id: number;
  /** The role it last had, kept while a lifted finger fades. */
  readonly role: FingerRole;
  readonly down: { readonly x: number; readonly y: number };
  /** Oldest first; the last point is where the finger is. */
  readonly points: ReadonlyArray<Point>;
  /** 1 while down, falling to 0 as a lifted finger fades. */
  readonly opacity: number;
};

type Entry = {
  role: FingerRole;
  readonly down: Trail['down'];
  readonly points: Array<Point>;
  liftedAt?: number;
};

/** Each finger's recent path, sampled once per painted frame. */
export const createTrails = () => {
  const trails = new Map<number, Entry>();

  return {
    record: (fingers: ReadonlyArray<Finger>, now: number) => {
      const down = new Set<number>();
      for (const finger of fingers) {
        down.add(finger.id);
        const trail = trails.get(finger.id) ?? {
          role: finger.role,
          down: { x: finger.down.x, y: finger.down.y },
          points: [],
        };
        trail.role = finger.role;
        trail.liftedAt = undefined;
        const last = trail.points.at(-1);
        const { x, y } = finger.current;
        if (last === undefined || last.x !== x || last.y !== y) {
          trail.points.push({ x, y, t: now });
        }
        trails.set(finger.id, trail);
      }
      for (const [id, trail] of trails) {
        if (!down.has(id)) trail.liftedAt ??= now;
      }
    },
    /** What to draw at `now`, keeping `keepMs` of path; drops what has faded. */
    visible: (now: number, keepMs: number): ReadonlyArray<Trail> => {
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
        while (trail.points.length > 1 && now - trail.points[0].t > keepMs) {
          trail.points.shift();
        }
        out.push({ id, ...trail, opacity: fade });
      }
      return out;
    },
    /** Whether anything is down or still fading, so another frame is needed. */
    animating: () => trails.size > 0,
  };
};
