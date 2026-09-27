/** The block's public surface: building blocks + the smoothness kit (see `kit/`). */
export {
  Div,
  enter,
  exit,
  loop,
  Present,
  Screen,
  stagger,
  step,
  StepNav,
  useSteps,
} from './kit';
export type { Canvas, EnterPreset, ExitPreset } from './kit';

/** Re-exported so authors reach for `motion.div` / `AnimatePresence` without a second import. */
export { motion, AnimatePresence } from 'motion/react';
