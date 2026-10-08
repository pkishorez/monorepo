import type { CDPSession } from 'playwright-core';

import type { FingerPoint, Gesture } from '../../../story/index.js';
import { easeInOutCubic, frameMillis, sleep, type Point } from './motion.js';

type Path = ReadonlyArray<FingerPoint>;

/** A tap holds the finger down long enough to be seen in the Recording. */
export const tapHold = 150;

/** Turns a Gesture into one timed path per finger, in viewport pixels. */
export async function fingerPaths(
  gesture: Gesture,
  locate: (target: string) => Promise<{ center: Point; size: number }>,
): Promise<readonly Path[]> {
  switch (gesture.kind) {
    case 'fingers':
      return gesture.paths;
    case 'tap': {
      const { center } = await locate(gesture.target);
      return [still(center, tapHold)];
    }
    case 'press': {
      const { center } = await locate(gesture.target);
      return [still(center, gesture.duration)];
    }
    case 'swipe': {
      const { center } = await locate(gesture.target);
      const along = directions[gesture.direction];
      const across = { x: -along.y, y: along.x };
      const half = gesture.distance / 2;
      return Array.from({ length: gesture.fingers }, (_, finger) => {
        const offset = (finger - (gesture.fingers - 1) / 2) * 44;
        const origin = {
          x: center.x + across.x * offset - along.x * half,
          y: center.y + across.y * offset - along.y * half,
        };
        // Keeps speed at release, as a flick does.
        return sampled(gesture.duration, (t) => {
          const eased = 0.5 * t + 0.5 * t * t;
          return {
            x: origin.x + along.x * gesture.distance * eased,
            y: origin.y + along.y * gesture.distance * eased,
          };
        });
      });
    }
    case 'drag': {
      const from = (await locate(gesture.from)).center;
      const to =
        typeof gesture.to === 'string'
          ? (await locate(gesture.to)).center
          : gesture.to;
      return [
        sampled(
          gesture.duration,
          (t) => {
            const eased = easeInOutCubic(t);
            return {
              x: from.x + (to.x - from.x) * eased,
              y: from.y + (to.y - from.y) * eased,
            };
          },
          true,
        ),
      ];
    }
    case 'pinch': {
      const { center, size } = await locate(gesture.target);
      const start = Math.min(90, Math.max(30, size / 4));
      return twoFingers(center, gesture.duration, (t) => ({
        radius: start + (start * gesture.scale - start) * easeInOutCubic(t),
        angle: Math.PI / 4,
      }));
    }
    case 'rotate': {
      const { center, size } = await locate(gesture.target);
      const radius = Math.min(90, Math.max(30, size / 4));
      return twoFingers(center, gesture.duration, (t) => ({
        radius,
        angle:
          Math.PI / 4 + ((gesture.degrees * Math.PI) / 180) * easeInOutCubic(t),
      }));
    }
  }
}

const directions = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
} as const;

function still(point: Point, duration: number): Path {
  return [
    { ...point, t: 0 },
    { ...point, t: duration },
  ];
}

/** Samples `at` at ~60fps over `duration`, optionally resting at both ends so the touch registers before it moves. */
function sampled(
  duration: number,
  at: (progress: number) => Point,
  rest = false,
): Path {
  const lead = rest ? tapHold : 0;
  const steps = Math.max(1, Math.round(duration / frameMillis));
  const path = Array.from({ length: steps + 1 }, (_, step) => ({
    ...at(step / steps),
    t: lead + (duration * step) / steps,
  }));
  if (!rest) return path;
  const last = path.at(-1)!;
  return [{ ...at(0), t: 0 }, ...path, { ...last, t: last.t + tapHold }];
}

function twoFingers(
  center: Point,
  duration: number,
  shape: (progress: number) => { radius: number; angle: number },
): readonly Path[] {
  return [0, Math.PI].map((turn) =>
    sampled(
      duration,
      (t) => {
        const { radius, angle } = shape(t);
        return {
          x: center.x + Math.cos(angle + turn) * radius,
          y: center.y + Math.sin(angle + turn) * radius,
        };
      },
      true,
    ),
  );
}

function positionAt(path: Path, time: number): Point | null {
  const first = path[0];
  const last = path.at(-1);
  if (first === undefined || last === undefined) return null;
  if (time < first.t || time > last.t) return null;
  for (let index = 1; index < path.length; index += 1) {
    const to = path[index]!;
    if (time > to.t) continue;
    const from = path[index - 1]!;
    const span = to.t - from.t;
    const progress = span === 0 ? 1 : (time - from.t) / span;
    return {
      x: from.x + (to.x - from.x) * progress,
      y: from.y + (to.y - from.y) * progress,
    };
  }
  return first;
}

/** Plays every finger's path at ~60fps through CDP, all touch points in each event. */
export async function dispatchFingers(
  cdp: CDPSession,
  paths: readonly Path[],
): Promise<void> {
  const end = Math.max(0, ...paths.map((path) => path.at(-1)?.t ?? 0));
  const start = performance.now();
  let active = new Set<number>();
  const last = new Map<number, { id: number; x: number; y: number }>();
  const send = (
    type: 'touchStart' | 'touchMove' | 'touchEnd',
    points: ReadonlyArray<{ id: number; x: number; y: number }>,
  ) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: points.map(({ id, x, y }) => ({
        id,
        x,
        y,
        radiusX: 12,
        radiusY: 12,
        force: 1,
      })),
    });

  for (let index = 0; ; index += 1) {
    const time = Math.min(index * frameMillis, end);
    const points = paths.flatMap((path, id) => {
      const point = positionAt(path, time);
      return point === null ? [] : [{ id, ...point }];
    });
    const present = new Set(points.map(({ id }) => id));
    const lifted = [...active].some((id) => !present.has(id));
    const added = points.some(({ id }) => !active.has(id));
    // CDP releases the points a touchEnd lists, so it names the lifted fingers where they left the screen.
    if (lifted) {
      await send(
        'touchEnd',
        [...active].flatMap((id) => {
          const point = last.get(id);
          return present.has(id) || point === undefined ? [] : [point];
        }),
      );
    }
    if (added) await send('touchStart', points);
    if (!lifted && !added && points.length > 0) await send('touchMove', points);
    for (const point of points) last.set(point.id, point);
    active = present;
    if (time >= end) break;
    await sleep(
      Math.max(0, start + (index + 1) * frameMillis - performance.now()),
    );
  }
  if (active.size > 0) {
    await send(
      'touchEnd',
      [...active].flatMap((id) => {
        const point = last.get(id);
        return point === undefined ? [] : [point];
      }),
    );
  }
}
