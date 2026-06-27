import {
  AnimatePresence,
  Div,
  Present,
  type Canvas,
  enter,
  exit,
  loop,
  stagger,
} from '../../index';

import { STAR_POS, type Sky } from './model';

/**
 * Renders one frame of the day cycle. The sky and sun are persistent elements
 * that re-paint and re-position via `layout`-free `initial={false}` animation;
 * the stars are a night-only list with a decorative twinkle; the label swaps
 * with a `layoutId` crossfade.
 */
export const dayScene = (
  { sky, sunX, sunY, sunSize, sunColor, glow, textColor, stars, label }: Sky,
  { cw }: Canvas,
) => (
  <Div
    className="absolute inset-0 flex items-center justify-center overflow-hidden"
    initial={false}
    animate={{ backgroundColor: sky }}
  >
    <AnimatePresence>
      {stars &&
        STAR_POS.map((s, i) => (
          <Div
            key={i}
            className="absolute size-[calc(0.4*var(--u))] rounded-full bg-white"
            style={{ left: s.x, top: s.y }}
            {...enter.scale}
            initial={enter.scale.initial}
            animate={{ opacity: [0.2, 0.9, 0.35], scale: 1 }}
            exit={exit.scale}
            transition={{
              opacity: loop(2.8, stagger(i, 0.35)),
              scale: { duration: 0.9, ...stagger(i, 0.12) },
            }}
          />
        ))}
    </AnimatePresence>

    <Div
      className="absolute rounded-full"
      initial={false}
      animate={{
        left: sunX,
        top: sunY,
        width: cw(sunSize),
        height: cw(sunSize),
        backgroundColor: sunColor,
        boxShadow: glow,
        x: '-50%',
        y: '-50%',
      }}
    />

    <div className="absolute inset-x-0 bottom-[calc(3.7*var(--u))] flex justify-center">
      <div className="relative flex h-[calc(1.8*var(--u))] items-center justify-center">
        <Present
          swapKey={label}
          layout
          layoutId="day-label"
          enter="fade"
          exit="fade"
          className="absolute whitespace-nowrap text-[calc(1.3*var(--u))] font-light tracking-[0.4em] uppercase"
          style={{ color: textColor }}
        >
          {label}
        </Present>
      </div>
    </div>
  </Div>
);
