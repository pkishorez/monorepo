import { useEffect, useState } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';

/*
 * The databases std-toolkit runs on, one at a time, under the title: each
 * rises in as the last blurs away, in the field's vermilion, since it
 * moves. A screen reader hears the whole list once instead.
 */

const DATABASES = ['DynamoDB', 'IndexedDB', 'SQLite', 'Memory'] as const;
const EVERY_MS = 2200;
const EASE = [0.23, 1, 0.32, 1] as const;

export function Databases() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(
      () => setIndex((each) => (each + 1) % DATABASES.length),
      EVERY_MS,
    );
    return () => clearInterval(timer);
  }, []);

  return (
    <MotionConfig reducedMotion="user">
      <span className="sr-only">DynamoDB, IndexedDB, SQLite and Memory</span>
      <span aria-hidden className="relative inline-block">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={DATABASES[index]}
            initial={{ opacity: 0, y: '0.35em', filter: 'blur(4px)' }}
            animate={{
              opacity: 1,
              y: 0,
              filter: 'blur(0px)',
              transition: { duration: 0.4, ease: EASE },
            }}
            exit={{
              opacity: 0,
              y: '-0.35em',
              filter: 'blur(4px)',
              transition: { duration: 0.25, ease: EASE },
            }}
            className="inline-block font-medium whitespace-nowrap text-(--field-accent)"
          >
            {DATABASES[index]}
          </motion.span>
        </AnimatePresence>
      </span>
    </MotionConfig>
  );
}
