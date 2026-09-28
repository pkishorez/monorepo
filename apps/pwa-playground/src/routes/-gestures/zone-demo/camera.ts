import type {
  GestureValues,
  Point,
} from '@kstackz/ui-toolkit/components/blocks/gestures';

/**
 * Where the grid's world sits on screen: a world point `p` shows at
 * `(x, y) + scale · rotate(rotation) · p`, in the grid's own px.
 */
export type Camera = {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
  readonly rotation: number;
};

const radians = (degrees: number) => (degrees * Math.PI) / 180;

/**
 * The camera moved by a Gesture that started at `origin`, in the grid's px:
 * the Gesture scales and rotates about its origin, then moves it by x and y.
 */
export const follow = (
  camera: Camera,
  gesture: GestureValues,
  origin: Point,
): Camera => {
  const cos = Math.cos(radians(gesture.rotation)) * gesture.scale;
  const sin = Math.sin(radians(gesture.rotation)) * gesture.scale;
  const qx = camera.x - origin.x;
  const qy = camera.y - origin.y;
  return {
    x: origin.x + gesture.x + cos * qx - sin * qy,
    y: origin.y + gesture.y + sin * qx + cos * qy,
    scale: camera.scale * gesture.scale,
    rotation: camera.rotation + gesture.rotation,
  };
};

/** The camera as an SVG transform. */
export const matrixOf = (camera: Camera): string => {
  const a = Math.cos(radians(camera.rotation)) * camera.scale;
  const b = Math.sin(radians(camera.rotation)) * camera.scale;
  return `matrix(${a} ${b} ${-b} ${a} ${camera.x} ${camera.y})`;
};
