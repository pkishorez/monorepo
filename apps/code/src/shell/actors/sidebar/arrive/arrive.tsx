import {
  type HTMLMotionProps,
  motion,
} from '@kestack/web-platform/ui/components/motion';
import { cn } from '@kestack/web-platform/ui/components/utils';

/*
 * How what the sidebar adds or takes away moves, rather than jumps: it
 * opens to its height as it fades in, and closes as it fades out, so what
 * is below glides. Out is quicker than in. Each sits in `AnimatePresence`,
 * which first draws without it; under reduced motion nothing moves.
 */

const EASE = [0.23, 1, 0.32, 1] as const;

export const arrive = {
  initial: { opacity: 0, height: 0 },
  animate: {
    opacity: 1,
    height: 'auto',
    transition: { duration: 0.24, ease: EASE },
  },
  exit: {
    opacity: 0,
    height: 0,
    transition: { duration: 0.18, ease: EASE },
  },
} as const;

/** A sidebar menu item that arrives and leaves by `arrive`, clipped as it does. */
export function ArriveItem({ className, ...props }: HTMLMotionProps<'li'>) {
  return (
    <motion.li
      data-slot="sidebar-menu-item"
      className={cn('group/menu-item relative overflow-hidden', className)}
      {...arrive}
      {...props}
    />
  );
}
