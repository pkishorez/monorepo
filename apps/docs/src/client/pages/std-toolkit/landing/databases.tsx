import { useEffect, useRef, useState } from 'react';
import {
  AnimatePresence,
  motion,
  useInView,
  useReducedMotion,
} from 'motion/react';

/*
 * The databases std-toolkit runs on, one a second, under the title, in
 * the field's vermilion, since it moves. Every name sits in the same grid
 * cell, the hidden ones holding it as wide as the widest, so a swap never
 * moves a thing. The new name rises in and sharpens as the old one lifts
 * away, a little faster. It waits while off screen, swaps without motion
 * when motion is reduced, and a screen reader hears the list once.
 */

const DATABASES = ['DynamoDB', 'IndexedDB', 'SQLite', 'Memory'] as const;
const EVERY_MS = 1000;
const EASE_OUT = [0.23, 1, 0.32, 1] as const;
const cell = '[grid-area:1/1]';

export function Databases() {
  const [index, setIndex] = useState(0);
  const slot = useRef<HTMLSpanElement>(null);
  const seen = useInView(slot);
  const still = useReducedMotion() ?? false;

  useEffect(() => {
    if (!seen) return;
    const timer = setInterval(
      () => setIndex((each) => (each + 1) % DATABASES.length),
      EVERY_MS,
    );
    return () => clearInterval(timer);
  }, [seen]);

  const name = DATABASES[index]!;
  return (
    <>
      <span className="sr-only">DynamoDB, IndexedDB, SQLite and Memory</span>
      <span ref={slot} aria-hidden className="inline-grid align-bottom">
        {DATABASES.map((each) => (
          <span key={each} className={`${cell} invisible`}>
            {each}
          </span>
        ))}
        <AnimatePresence initial={false}>
          <motion.span
            key={name}
            className={`${cell} whitespace-nowrap text-(--field-accent) will-change-transform`}
            initial={
              still ? false : { opacity: 0, y: '0.45em', filter: 'blur(4px)' }
            }
            animate={{
              opacity: 1,
              y: 0,
              filter: 'blur(0px)',
              transition: { duration: 0.32, ease: EASE_OUT },
            }}
            exit={
              still
                ? { opacity: 0, transition: { duration: 0 } }
                : {
                    opacity: 0,
                    y: '-0.35em',
                    filter: 'blur(4px)',
                    transition: { duration: 0.2, ease: EASE_OUT },
                  }
            }
          >
            {name}
          </motion.span>
        </AnimatePresence>
      </span>
    </>
  );
}
