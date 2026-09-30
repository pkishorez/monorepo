import {
  CalendarIcon,
  CameraIcon,
  CloudIcon,
  MailIcon,
  MapIcon,
  MusicIcon,
} from '@kstackz/ui-toolkit/lucide';
import { type Pointer, useGesture } from '@kstackz/use-gesture/core';
import { animate, motion, motionValue } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { useStageStatus } from '../../stage/index.ts';

const HOLD_MS = 400;
// How far the finger may drift during the hold.
const SLOP = 8;
const SIZE = 80;
const GAP = 12;
const COLUMNS = 3;
const SPRING = { type: 'spring', bounce: 0, visualDuration: 0.25 } as const;

const TILES = [
  { id: 'camera', Icon: CameraIcon, hue: 25 },
  { id: 'music', Icon: MusicIcon, hue: 350 },
  { id: 'map', Icon: MapIcon, hue: 150 },
  { id: 'mail', Icon: MailIcon, hue: 250 },
  { id: 'calendar', Icon: CalendarIcon, hue: 60 },
  { id: 'cloud', Icon: CloudIcon, hue: 210 },
];

const slotOf = (index: number) => ({
  x: (index % COLUMNS) * (SIZE + GAP),
  y: Math.floor(index / COLUMNS) * (SIZE + GAP),
});

const indexAt = (x: number, y: number) => {
  const clamp = (v: number, max: number) => Math.min(Math.max(v, 0), max);
  const column = clamp(Math.round(x / (SIZE + GAP)), COLUMNS - 1);
  const row = clamp(Math.round(y / (SIZE + GAP)), TILES.length / COLUMNS - 1);
  return row * COLUMNS + column;
};

/**
 * A grid of tiles. Holding one still lifts it; then it follows the finger,
 * and the others make room. Moving before the hold ends lifts nothing.
 */
export function HoldToLift() {
  const [order, setOrder] = useState(() => TILES.map((tile) => tile.id));
  const [positions] = useState(
    () =>
      new Map(
        TILES.map((tile, i) => [
          tile.id,
          { x: motionValue(slotOf(i).x), y: motionValue(slotOf(i).y) },
        ]),
      ),
  );
  const [pressed, setPressed] = useState<string>();
  const [lifted, setLifted] = useState<string>();
  const [early, setEarly] = useState(false);
  const stop = useRef<() => void>(undefined);
  useStageStatus(
    lifted !== undefined
      ? `Lifted · slot ${order.indexOf(lifted) + 1}`
      : pressed !== undefined
        ? 'Holding…'
        : early
          ? 'Moved too soon: nothing lifted'
          : undefined,
  );

  // Every tile but the lifted one springs to its slot.
  useEffect(() => {
    order.forEach((id, i) => {
      const position = positions.get(id)!;
      if (id === lifted) return;
      animate(position.x, slotOf(i).x, SPRING);
      animate(position.y, slotOf(i).y, SPRING);
    });
  }, [order, lifted, positions]);

  // The lifted tile follows the finger; where it is decides its slot.
  const drag = (id: string, finger: Pointer) => {
    const position = positions.get(id)!;
    position.x.stop();
    position.y.stop();
    const from = {
      x: position.x.get() - finger.dx.get(),
      y: position.y.get() - finger.dy.get(),
    };
    const follow = () => {
      const x = from.x + finger.dx.get();
      const y = from.y + finger.dy.get();
      position.x.set(x);
      position.y.set(y);
      const to = indexAt(x, y);
      setOrder((now) => {
        if (now.indexOf(id) === to) return now;
        const next = now.filter((other) => other !== id);
        next.splice(to, 0, id);
        return next;
      });
    };
    const offs = [
      finger.dx.on('change', follow),
      finger.dy.on('change', follow),
    ];
    return () => offs.forEach((off) => off());
  };

  useGesture({
    onStart: (pointers) => {
      const [finger] = pointers.values();
      const id =
        finger?.target?.closest<HTMLElement>('[data-tile]')?.dataset.tile;
      setEarly(false);
      if (finger === undefined || id === undefined) return;
      setPressed(id);
      const timer = setTimeout(() => {
        offs.forEach((off) => off());
        setPressed(undefined);
        setLifted(id);
        stop.current = drag(id, finger);
      }, HOLD_MS);
      const drift = () => {
        if (Math.hypot(finger.dx.get(), finger.dy.get()) <= SLOP) return;
        stop.current?.();
        setPressed(undefined);
        setEarly(true);
      };
      const offs = [
        finger.dx.on('change', drift),
        finger.dy.on('change', drift),
      ];
      stop.current = () => {
        clearTimeout(timer);
        offs.forEach((off) => off());
      };
    },
    onEnd: (_, end) => {
      stop.current?.();
      stop.current = undefined;
      setPressed(undefined);
      if (lifted !== undefined) end.preventClick();
      setLifted(undefined);
    },
  });

  return (
    <div className="absolute inset-0 grid place-items-center">
      <div
        className="relative"
        style={{
          width: COLUMNS * SIZE + (COLUMNS - 1) * GAP,
          height: (TILES.length / COLUMNS) * (SIZE + GAP) - GAP,
        }}
      >
        {TILES.map(({ id, Icon, hue }) => (
          <motion.div
            key={id}
            data-tile={id}
            className="absolute top-0 left-0 grid place-items-center rounded-2xl text-white data-lifted:z-10 data-lifted:shadow-xl"
            data-lifted={lifted === id ? '' : undefined}
            style={{
              width: SIZE,
              height: SIZE,
              x: positions.get(id)!.x,
              y: positions.get(id)!.y,
              background: `oklch(0.68 0.15 ${hue})`,
            }}
            animate={{
              scale: lifted === id ? 1.1 : pressed === id ? 0.94 : 1,
            }}
            transition={
              pressed === id
                ? { duration: HOLD_MS / 1000, ease: 'linear' }
                : SPRING
            }
          >
            <Icon aria-hidden="true" className="size-8" />
          </motion.div>
        ))}
      </div>
    </div>
  );
}
