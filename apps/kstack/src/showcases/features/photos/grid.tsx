import { GestureZone } from '@kstackz/use-gesture';
import { type Pointer, useGesture } from '@kstackz/use-gesture/core';
import {
  animate,
  motion,
  useMotionTemplate,
  useMotionValue,
  useTransform,
} from 'motion/react';
import { memo, type RefObject, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { Photo } from './data.ts';
import { between, down, track } from './fingers.ts';
import { PhotoArt } from './photo.tsx';

type Columns = 3 | 5;

const SPRING = { type: 'spring', visualDuration: 0.3, bounce: 0 } as const;

type GridProps = {
  readonly photos: ReadonlyArray<Photo>;
  /** The photo the viewer shows, whose tile it lifts out. */
  readonly hidden: string | undefined;
  /** Every tile on screen by photo id, for the viewer to grow from. */
  readonly tiles: Map<string, HTMLElement>;
  readonly onOpen: (index: number) => void;
  /** A photo the viewer handed back, on its way to its tile. */
  readonly flight: Flight | undefined;
  readonly onLanded: () => void;
};

type Point = { readonly x: number; readonly y: number };

/** A closing photo as the viewer hands it over, to land on its tile. */
export type Flight = {
  readonly photo: Photo;
  /** Its size fitted to the screen, before any scale. */
  readonly size: { readonly w: number; readonly h: number };
  /** Where its centre is on the screen now. */
  readonly center: Point;
  readonly scale: number;
  /** How much of each side is cut away now, in its own px. */
  readonly clip: Point;
};

/**
 * The library: square tiles that scroll, and a pinch that changes how many
 * fit a row, 3 or 5. The photo under the fingers stays under them.
 */
export function Grid(props: GridProps) {
  const scroller = useRef<HTMLDivElement>(null);
  return (
    <GestureZone
      ref={scroller}
      className="absolute inset-0 overflow-x-hidden overflow-y-auto"
    >
      <Tiles {...props} scroller={scroller} />
    </GestureZone>
  );
}

function Tiles(
  props: GridProps & { readonly scroller: RefObject<HTMLDivElement | null> },
) {
  const { photos, tiles, scroller } = props;
  const [columns, setColumns] = useState<Columns>(3);
  // Measured instead of the grid, whose transform may not have caught up.
  const still = useRef<HTMLDivElement>(null);
  const scale = useMotionValue(1);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const ox = useMotionValue(0);
  const oy = useMotionValue(0);
  const transformOrigin = useMotionTemplate`${ox}px ${oy}px`;
  const pinch = useRef<
    { a: number; b: number; origin: Point; stop: () => void } | undefined
  >(undefined);

  // A pinch past a threshold swaps the columns, then eases from the size the
  // fingers left the tiles at to their new one, pinned to the photo under them.
  const switchTo = (next: Columns, from: number, origin: Point) => {
    const el = scroller.current;
    const first = photos[0] === undefined ? undefined : tiles.get(photos[0].id);
    if (el === null || first === undefined) return;
    const pitch = first.offsetWidth + 2;
    const col = Math.min(
      Math.max(Math.floor((origin.x - first.offsetLeft) / pitch), 0),
      columns - 1,
    );
    const row = Math.max(Math.floor((origin.y - first.offsetTop) / pitch), 0);
    const anchor = photos[Math.min(row * columns + col, photos.length - 1)];
    const tile = anchor === undefined ? undefined : tiles.get(anchor.id);
    if (tile === undefined) return;
    const clamp = (v: number) => Math.min(Math.max(v, 0), 1);
    const fx = clamp((origin.x - tile.offsetLeft) / tile.offsetWidth);
    const fy = clamp((origin.y - tile.offsetTop) / tile.offsetHeight);
    const seen = { x: origin.x, y: origin.y - el.scrollTop };

    flushSync(() => setColumns(next));
    const q = {
      x: tile.offsetLeft + fx * tile.offsetWidth,
      y: tile.offsetTop + fy * tile.offsetHeight,
    };
    el.scrollTop = q.y - seen.y;
    ox.set(q.x);
    oy.set(q.y);
    scale.set((from * next) / columns);
    x.set(seen.x - q.x);
    y.set(seen.y - (q.y - el.scrollTop));
    settle();
  };

  const settle = () => {
    animate(scale, 1, SPRING);
    animate(x, 0, SPRING);
    animate(y, 0, SPRING);
  };

  const at = (point: Point): Point => {
    const box = still.current?.getBoundingClientRect();
    return box === undefined
      ? point
      : { x: point.x - box.left, y: point.y - box.top };
  };

  const begin = (a: Pointer, b: Pointer) => {
    for (const v of [scale, x, y]) v.stop();
    scale.jump(1);
    x.jump(0);
    y.jump(0);
    const start = between(a, b);
    const origin = at(start);
    ox.set(origin.x);
    oy.set(origin.y);
    // Past the end it stretches only a little: there is no 2 or 7.
    const follow = () => {
      const r = between(a, b).d / Math.max(start.d, 1);
      scale.set(
        columns === 3 && r > 1
          ? 1 + (r - 1) * 0.2
          : columns === 5 && r < 1
            ? 1 - (1 - r) * 0.2
            : Math.min(Math.max(r, 0.5), 2),
      );
    };
    pinch.current = { a: a.id, b: b.id, origin, stop: track([a, b], follow) };
  };

  const end = () => {
    const current = pinch.current;
    if (current === undefined) return;
    current.stop();
    pinch.current = undefined;
    const s = scale.get();
    if (columns === 3 && s < 0.88) switchTo(5, s, current.origin);
    else if (columns === 5 && s > 1.14) switchTo(3, s, current.origin);
    else settle();
  };

  useGesture({
    onPointer: (_pointer, pointers) => {
      const fingers = down(pointers);
      const current = pinch.current;
      const [a, b] = fingers;
      if (current === undefined) {
        if (a !== undefined && b !== undefined) begin(a, b);
      } else if (
        !fingers.some((p) => p.id === current.a) ||
        !fingers.some((p) => p.id === current.b)
      ) {
        end();
      }
    },
    onEnd: (pointers, { preventClick }) => {
      end();
      if (pointers.size > 1) preventClick();
    },
  });

  // A trackpad pinch on a desktop arrives as a wheel with ctrl held.
  const latest = useRef({ columns, switchTo, at });
  useEffect(() => {
    latest.current = { columns, switchTo, at };
  });
  useEffect(() => {
    const el = scroller.current;
    if (el === null) return;
    let sum = 0;
    let quiet = 0;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      if (event.timeStamp < quiet) return;
      sum += event.deltaY;
      const { columns, switchTo, at } = latest.current;
      const next =
        sum > 24 && columns === 3
          ? 5
          : sum < -24 && columns === 5
            ? 3
            : undefined;
      if (next === undefined) return;
      sum = 0;
      quiet = event.timeStamp + 400;
      switchTo(next, 1, at({ x: event.clientX, y: event.clientY }));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [scroller]);

  // A new album starts at its top.
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [photos, scroller]);

  return (
    // The still wrapper keeps the scroll height while the grid scales.
    <div ref={still}>
      <motion.div
        className="relative grid gap-0.5 pt-[calc(env(safe-area-inset-top)+3.5rem)] pr-[env(safe-area-inset-right)] pb-[calc(env(safe-area-inset-bottom)+5.5rem)] pl-[env(safe-area-inset-left)]"
        style={{
          gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
          scale,
          x,
          y,
          transformOrigin,
        }}
      >
        {photos.map((photo, index) => (
          <Tile
            key={photo.id}
            photo={photo}
            index={index}
            hidden={
              photo.id === props.hidden || photo.id === props.flight?.photo.id
            }
            tiles={tiles}
            onOpen={props.onOpen}
          />
        ))}
        {props.flight === undefined ? null : (
          // Clipped to the content, so it never makes it scroll further.
          <div className="pointer-events-none absolute inset-0 overflow-clip">
            <Ghost
              key={props.flight.photo.id}
              flight={props.flight}
              tiles={tiles}
              still={still}
              onLanded={props.onLanded}
            />
          </div>
        )}
      </motion.div>
    </div>
  );
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * The closing photo, flying from where the viewer left it onto its tile.
 * It lives in the scrolling content, placed by where its tile sits in it, so
 * the grid's own scrolling carries it with the tile, and the header covers it
 * like any tile.
 */
function Ghost(props: {
  readonly flight: Flight;
  readonly tiles: Map<string, HTMLElement>;
  readonly still: RefObject<HTMLDivElement | null>;
  readonly onLanded: () => void;
}) {
  const { flight, tiles } = props;
  const { w, h } = flight.size;
  const side = Math.min(w, h);
  // 0 where the viewer left it, 1 on its tile.
  const t = useMotionValue(0);
  // Its centre in the content, taken once as it is handed over.
  const [from] = useState(() => {
    const box = props.still.current?.getBoundingClientRect();
    return {
      x: flight.center.x - (box?.left ?? 0),
      y: flight.center.y - (box?.top ?? 0),
    };
  });
  // Where its tile is in the content, which scrolling never changes; it
  // stays on the last one found if the tile goes.
  const last = useRef({ ...from, k: flight.scale });
  const tile = useTransform(() => {
    t.get();
    const el = tiles.get(flight.photo.id);
    if (el !== undefined) {
      last.current = {
        x: el.offsetLeft + el.offsetWidth / 2,
        y: el.offsetTop + el.offsetHeight / 2,
        k: el.offsetWidth / side,
      };
    }
    return last.current;
  });
  const x = useTransform(() => lerp(from.x, tile.get().x, t.get()) - w / 2);
  const y = useTransform(() => lerp(from.y, tile.get().y, t.get()) - h / 2);
  const scale = useTransform(() => lerp(flight.scale, tile.get().k, t.get()));
  const clipPath = useTransform(() => {
    const v = t.get();
    return `inset(${lerp(flight.clip.y, (h - side) / 2, v)}px ${lerp(flight.clip.x, (w - side) / 2, v)}px)`;
  });

  const landed = useRef(props.onLanded);
  useEffect(() => {
    void animate(t, 1, SPRING).then(() => landed.current());
  }, [t]);

  return (
    <motion.div
      className="absolute top-0 left-0"
      style={{ width: w, height: h, x, y, scale, clipPath }}
    >
      <PhotoArt photo={flight.photo} />
    </motion.div>
  );
}

const DAY = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  day: 'numeric',
  timeZone: 'UTC',
});

/** One square tile; tapping it opens the viewer, which grows from it. */
const Tile = memo(function Tile(props: {
  readonly photo: Photo;
  readonly index: number;
  readonly hidden: boolean;
  readonly tiles: Map<string, HTMLElement>;
  readonly onOpen: (index: number) => void;
}) {
  const { photo, tiles } = props;
  return (
    <button
      type="button"
      ref={(el) => {
        if (el === null) return;
        tiles.set(photo.id, el);
        return () => {
          if (tiles.get(photo.id) === el) tiles.delete(photo.id);
        };
      }}
      aria-label={`Photo, ${DAY.format(photo.taken)}`}
      className="relative block aspect-square scroll-mt-[calc(env(safe-area-inset-top)+3.5rem)] scroll-mb-[calc(env(safe-area-inset-bottom)+5.5rem)] overflow-hidden bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
      style={{ visibility: props.hidden ? 'hidden' : undefined }}
      onClick={() => props.onOpen(props.index)}
    >
      <PhotoArt photo={photo} />
    </button>
  );
});
