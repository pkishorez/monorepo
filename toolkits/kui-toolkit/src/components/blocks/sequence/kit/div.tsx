import { forwardRef, useContext } from 'react';

import { type HTMLMotionProps, motion } from 'motion/react';

import { TransitionContext } from '../internal';

/**
 * `motion.div` with the scene's default transition baked in — the shared
 * commonality set by `<Screen speed>`. Pass any motion props (`layout`,
 * `layoutId`, `animate`, `style`, …); they pass straight through. Give your own
 * `transition` to override the default for a single element.
 */
export const Div = forwardRef<HTMLDivElement, HTMLMotionProps<'div'>>(
  function Div({ transition, ...props }, ref) {
    const fallback = useContext(TransitionContext);
    return (
      <motion.div ref={ref} transition={transition ?? fallback} {...props} />
    );
  },
);
