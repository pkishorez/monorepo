import { motion, useReducedMotion } from 'motion/react';

import { Brand, type Branding } from './brand';

export function Loader({ branding }: { branding: Branding }) {
  const still = useReducedMotion();
  return (
    <motion.div
      role="status"
      aria-label="Loading"
      className="select-none"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.15, duration: 0.3, ease: 'easeOut' }}
    >
      <motion.div
        animate={still ? { opacity: 1 } : { opacity: [1, 0.45, 1] }}
        transition={{ duration: 2, ease: 'easeInOut', repeat: Infinity }}
      >
        <Brand branding={branding} size="large" />
      </motion.div>
    </motion.div>
  );
}
