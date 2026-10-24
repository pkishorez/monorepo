import type { Fingers, Point } from './hand.ts';

/*
 * The landmarks the math reads, and the math. MediaPipe numbers a hand's
 * 21 points from the wrist (0) out along each finger: knuckle, two joints,
 * tip.
 */

export const WRIST = 0;
export const THUMB_TIP = 4;
export const INDEX_KNUCKLE = 5;
export const INDEX_TIP = 8;
export const MIDDLE_KNUCKLE = 9;
export const MIDDLE_TIP = 12;
export const PINKY_KNUCKLE = 17;

/** Each finger's middle joint and tip, index to pinky. */
const FINGERS = [
  [6, 8],
  [10, 12],
  [14, 16],
  [18, 20],
] as const;

export const distance = (a: Point, b: Point) =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** Distance on screen, x stretched by the image's aspect so both axes are the same unit. */
export const flatDistance = (a: Point, b: Point, aspect: number) =>
  Math.hypot((a.x - b.x) * aspect, a.y - b.y);

/** An angle in degrees, wrapped to -180..180. */
export const wrap = (degrees: number) =>
  ((((degrees + 180) % 360) + 360) % 360) - 180;

/** Which fingers are out, read from the world points so it holds at any distance. */
export const fingersOf = (world: ReadonlyArray<Point>): Fingers => {
  const at = (i: number) => world[i]!;
  const palm = distance(at(WRIST), at(MIDDLE_KNUCKLE));
  // A tucked thumb lies across the palm, near the middle knuckle.
  const thumb = distance(at(THUMB_TIP), at(MIDDLE_KNUCKLE)) / palm > 0.62;
  // A curled finger's tip comes back past its middle joint, toward the wrist.
  const [index, middle, ring, pinky] = FINGERS.map(
    ([joint, tip]) =>
      distance(at(WRIST), at(tip)) > distance(at(WRIST), at(joint)) * 1.1,
  ) as [boolean, boolean, boolean, boolean];
  return [thumb, index, middle, ring, pinky];
};

/** The centre of the palm: the wrist and the four knuckles. */
export const palmCentre = (points: ReadonlyArray<Point>) => {
  const ids = [WRIST, INDEX_KNUCKLE, MIDDLE_KNUCKLE, 13, PINKY_KNUCKLE];
  const sum = ids.reduce(
    (acc, i) => ({ x: acc.x + points[i]!.x, y: acc.y + points[i]!.y }),
    { x: 0, y: 0 },
  );
  return { x: sum.x / ids.length, y: sum.y / ids.length };
};
