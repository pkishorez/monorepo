import { AnimatePresence, motion } from 'motion/react';
import type { ReactNode } from 'react';
import { useRouter } from '@kestack/kabuki/routing';
import { directionOf, settle, slide } from './motion.ts';

/*
 * Where a page draws the page under it, or the page the URL names: the one
 * going out pops out of the flow and fades as the new one slides in, the
 * way the move went. Nothing animates on the first drawing, so a page the
 * server drew is shown as drawn. Scroll anchoring is off, so taking the
 * page that went out away never moves a scroll Kabuki put back.
 */

export function Slot({
  id,
  children,
  className = '',
}: {
  /** What is in it now: a new one slides in. */
  readonly id: string;
  readonly children: ReactNode;
  readonly className?: string;
}) {
  const direction = directionOf(useRouter().move.how);
  return (
    <div
      className={`relative overflow-x-clip [overflow-anchor:none] ${className}`}
    >
      <AnimatePresence mode="popLayout" initial={false} custom={direction}>
        <motion.div
          key={id}
          custom={direction}
          variants={slide}
          initial="enter"
          animate="center"
          exit="exit"
          transition={settle}
          className="h-full"
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
