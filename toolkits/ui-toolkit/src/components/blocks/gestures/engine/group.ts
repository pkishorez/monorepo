import type { Direction, Point, Scroll, Side, Track } from './types';

export const centroid = (points: ReadonlyArray<Point>): Point => {
  if (points.length === 0) return { x: 0, y: 0 };
  let x = 0;
  let y = 0;
  for (const point of points) {
    x += point.x;
    y += point.y;
  }
  return { x: x / points.length, y: y / points.length };
};

/** A sample's position, without its time. */
export const pointOf = (point: Point): Point => ({ x: point.x, y: point.y });

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** The acting fingers taken as one: where they went down, where they are, and how far apart. */
export const measureGroup = (tracks: ReadonlyArray<Track>) => {
  const down = centroid(tracks.map((track) => track.down));
  const current = centroid(tracks.map((track) => track.current));
  const [a, b] = tracks;
  return {
    down,
    current,
    offset: { x: current.x - down.x, y: current.y - down.y },
    spreadDown:
      a === undefined || b === undefined ? 0 : distance(a.down, b.down),
    spread:
      a === undefined || b === undefined ? 0 : distance(a.current, b.current),
  };
};

type Group = ReturnType<typeof measureGroup>;

/** The direction a movement mostly went. */
export const directionOf = (offset: Point): Direction =>
  Math.abs(offset.x) >= Math.abs(offset.y)
    ? offset.x < 0
      ? 'left'
      : 'right'
    : offset.y < 0
      ? 'up'
      : 'down';

/** Whether `direction` lies along the axis the browser scrolls. */
export const alongScroll = (direction: Direction, scroll: Scroll): boolean =>
  scroll === 'x'
    ? direction === 'left' || direction === 'right'
    : scroll === 'y' && (direction === 'up' || direction === 'down');

/** Two fingers Pinch when they move apart or together more than they travel together. */
export const isPinch = (group: Group): boolean =>
  Math.abs(group.spread - group.spreadDown) >
  Math.hypot(group.offset.x, group.offset.y);

/** Which side of the acting fingers a held finger sits. */
export const sideOf = (held: Point, acting: Point): Side =>
  held.x < acting.x ? 'left' : 'right';

/** `offset` measured along `direction`: positive toward it. */
export const along = (offset: Point, direction: Direction): number => {
  switch (direction) {
    case 'right':
      return offset.x;
    case 'left':
      return -offset.x;
    case 'down':
      return offset.y;
    case 'up':
      return -offset.y;
  }
};

export const opposite = (direction: Direction): Direction => {
  switch (direction) {
    case 'right':
      return 'left';
    case 'left':
      return 'right';
    case 'down':
      return 'up';
    case 'up':
      return 'down';
  }
};
