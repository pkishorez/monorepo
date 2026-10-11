// oxlint-disable-next-line no-restricted-imports -- the Marbles overlay lives outside the tree: it reads the DOM the Views drew after each new Log entry and flies a Marble over it, keeping nothing in React.
import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import type { Entry } from 'effect-oak';
import type { AppRuntime } from 'effect-oak/react';
import { marbleStyle } from '../shapes/index.js';

interface Point {
  readonly x: number;
  readonly y: number;
}

/**
 * The Marbles: for each new Log entry while live, one dot flies to the
 * Circle of the Instance the Message was Sent to. From a View it comes from
 * the last click; from a Command, from the Edge; from a Worker, from its
 * Ring; a Request Climbs from the source Circle to its parent's. An ignored
 * or dropped Message lands hollow.
 */
export const Marbles = ({
  useRuntime,
  picture,
}: {
  readonly useRuntime: () => AppRuntime;
  /** The Picture every Marble is measured against. */
  readonly picture: RefObject<HTMLDivElement | null>;
}) => {
  const { log, shown, outcome } = useRuntime();
  const layer = useRef<HTMLDivElement>(null);
  const flown = useRef(log.length);
  const pointer = useRef<Point | null>(null);

  useEffect(() => {
    const root = picture.current;
    if (!root) return;
    const remember = (event: MouseEvent) => {
      pointer.current = { x: event.clientX, y: event.clientY };
    };
    root.addEventListener('click', remember, true);
    return () => root.removeEventListener('click', remember, true);
  }, [picture]);

  useEffect(() => {
    if (shown !== null || log.length < flown.current) {
      flown.current = log.length;
      return;
    }
    const fresh = log.slice(flown.current);
    flown.current = log.length;
    const root = picture.current;
    const over = layer.current;
    if (!root || !over) return;
    for (const entry of fresh)
      fly(entry, outcome(entry.id) !== 'handled', root, over, pointer.current);
  }, [log, shown, outcome, picture]);

  return (
    <div
      ref={layer}
      aria-hidden
      className="pointer-events-none absolute inset-0 z-20"
    />
  );
};

const find = (root: HTMLElement, attribute: string, value: string) =>
  root.querySelector<HTMLElement>(`[${attribute}="${CSS.escape(value)}"]`);

/** Fly one Marble from where its Source is drawn to its Instance's Circle; drop it if the Circle is gone. */
const fly = (
  entry: Entry,
  hollow: boolean,
  root: HTMLElement,
  over: HTMLElement,
  pointer: Point | null,
) => {
  const target = find(root, 'data-instance', entry.destination);
  if (!target) return;
  const box = root.getBoundingClientRect();
  const local = (rect: DOMRect, atTop = false): Point => ({
    x: rect.left - box.left + rect.width / 2,
    y: rect.top - box.top + (atTop ? 0 : rect.height / 2),
  });
  const to = local(target.getBoundingClientRect());
  const from = origin(entry, root, box, to, pointer, local);

  const dot = document.createElement('span');
  Object.assign(dot.style, marbleStyle(entry.source.kind, hollow), {
    position: 'absolute',
    left: `${from.x}px`,
    top: `${from.y}px`,
    translate: '-50% -50%',
  });
  over.appendChild(dot);
  const climb =
    'instance' in entry.source && entry.source.instance !== entry.destination;
  const flight = dot.animate(
    [
      { left: `${from.x}px`, top: `${from.y}px` },
      { left: `${to.x}px`, top: `${to.y}px` },
    ],
    {
      duration: climb ? 600 : 400,
      easing: 'cubic-bezier(0.2, 0, 0, 1)',
      fill: 'forwards',
    },
  );
  flight.finished
    .then(
      () =>
        dot.animate(
          [
            { opacity: 1, scale: 1 },
            { opacity: 0, scale: 1.8 },
          ],
          { duration: 250, fill: 'forwards' },
        ).finished,
    )
    .then(() => dot.remove());
};

/** Where a Marble starts, by its Source. */
const origin = (
  entry: Entry,
  root: HTMLElement,
  box: DOMRect,
  to: Point,
  pointer: Point | null,
  local: (rect: DOMRect, atTop?: boolean) => Point,
): Point => {
  const { source } = entry;
  if ('instance' in source && source.instance !== entry.destination) {
    const from = find(root, 'data-instance', source.instance);
    return from ? local(from.getBoundingClientRect()) : to;
  }
  switch (source.kind) {
    case 'view':
      return pointer ? { x: pointer.x - box.left, y: pointer.y - box.top } : to;
    case 'restore':
    case 'outside':
    case 'provide':
      return to;
    case 'worker': {
      const ring = find(
        root,
        'data-worker',
        `${source.instance}/${source.name}/${source.key ?? ''}`,
      );
      return ring ? local(ring.getBoundingClientRect(), true) : to;
    }
    case 'command':
      return nearestEdge(box, to);
  }
};

/** The point on the Edge nearest a Circle. */
const nearestEdge = (box: DOMRect, to: Point): Point => {
  const edges: ReadonlyArray<Point> = [
    { x: to.x, y: 0 },
    { x: box.width, y: to.y },
    { x: to.x, y: box.height },
    { x: 0, y: to.y },
  ];
  return edges.reduce((best, edge) =>
    Math.hypot(edge.x - to.x, edge.y - to.y) <
    Math.hypot(best.x - to.x, best.y - to.y)
      ? edge
      : best,
  );
};
