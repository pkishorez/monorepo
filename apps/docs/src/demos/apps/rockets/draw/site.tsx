import { createContext, use, useState } from 'react';
import type { ReactNode } from 'react';
import { motion } from 'motion/react';

/*
 * The launch site: rows of launch pads on the left and landing pads on the
 * right, five rockets to a row, at most twenty. The whole site zooms to fit
 * the space it is drawn in, so building a rocket zooms it out a little.
 */

export type Point = { readonly x: number; readonly y: number };

/** Where one rocket lives: its name, its launch pad and, once it can fly, its landing pad. */
export type Slot = {
  readonly name: string;
  readonly launch: Point;
  readonly landing?: Point;
};

export const MOST = 20;
const COLUMNS = 5;
const PAD = 120;
const GAP = 100;
const ROW = 300;
const FOOT = 80;

const layout = (count: number, landing: boolean) => {
  const columns = Math.max(1, Math.min(count, COLUMNS));
  const rows = Math.max(1, Math.ceil(count / COLUMNS));
  const at = (index: number) => {
    const column = index % COLUMNS;
    const y = Math.floor(index / COLUMNS) * ROW;
    return landing
      ? {
          launch: { x: -GAP / 2 - (columns - column - 0.5) * PAD, y },
          landing: { x: GAP / 2 + (column + 0.5) * PAD, y },
        }
      : { launch: { x: (column - (columns - 1) / 2) * PAD, y } };
  };
  const half = landing ? GAP / 2 + columns * PAD : (columns * PAD) / 2;
  const sky = landing ? 400 : 190;
  return {
    at,
    width: 2 * half,
    top: -sky,
    height: sky + (rows - 1) * ROW + FOOT,
  };
};

type Site = { readonly at: (index: number) => Omit<Slot, 'name'> };
const SiteContext = createContext<Site | null>(null);
const SlotContext = createContext<Slot | null>(null);

/** The slot of the rocket drawn here, or `null` for a rocket drawn on its own. */
export const useSlot = () => use(SlotContext);

/** Draws the site for `count` rockets, scaled to fill its box below `top`. */
export function Site({
  count,
  landing,
  top = 24,
  bottom = 24,
  children,
}: {
  count: number;
  landing: boolean;
  /** Room kept free at the top, for a toolbar. */
  top?: number;
  /** Room kept free at the bottom. */
  bottom?: number;
  children: ReactNode;
}) {
  const [box, setBox] = useState({ width: 0, height: 0 });
  const [measure] = useState(() => (element: HTMLDivElement | null) => {
    if (!element) return;
    const fit = () =>
      setBox((was) =>
        was.width === element.clientWidth && was.height === element.clientHeight
          ? was
          : { width: element.clientWidth, height: element.clientHeight },
      );
    fit();
    const watch = new ResizeObserver(fit);
    watch.observe(element);
    return () => watch.disconnect();
  });

  const site = layout(count, landing);
  const room = { width: box.width - 48, height: box.height - top - bottom };
  const scale = Math.max(
    0.01,
    Math.min(1.5, room.width / site.width, room.height / site.height),
  );
  const x = box.width / 2;
  const y = top + (room.height - site.height * scale) / 2 - site.top * scale;

  return (
    <div ref={measure} className="absolute inset-0 overflow-hidden">
      {box.width > 0 && (
        <motion.div
          className="absolute top-0 left-0"
          style={{ transformOrigin: '0 0' }}
          initial={{ x, y, scale }}
          animate={{ x, y, scale }}
          transition={{ type: 'spring', stiffness: 70, damping: 18 }}
        >
          <SiteContext value={{ at: site.at }}>{children}</SiteContext>
        </motion.div>
      )}
    </div>
  );
}

/** One rocket's place on the site: its pads follow its index. */
export const Place = ({
  index,
  name,
  children,
}: {
  index: number;
  name: string;
  children: ReactNode;
}) => {
  const site = use(SiteContext);
  if (!site) throw new Error('A Place is drawn outside a Site');
  return (
    <SlotContext value={{ name, ...site.at(index) }}>{children}</SlotContext>
  );
};
