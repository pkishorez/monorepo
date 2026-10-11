import { useState } from 'react';
import type { ReactNode } from 'react';
import { motion } from 'motion/react';

/** A toolbar button: outlined, or filled while `pressed`. */
export const Pill = ({
  onClick,
  pressed,
  disabled,
  children,
}: {
  onClick: () => void;
  pressed?: boolean;
  disabled?: boolean;
  children: ReactNode;
}) => (
  <button
    type="button"
    aria-pressed={pressed}
    disabled={disabled}
    onClick={onClick}
    className={`rounded-full border border-foreground px-4 py-1.5 text-sm transition-colors duration-150 disabled:opacity-40 ${pressed ? 'bg-foreground text-background' : 'hover:bg-foreground/5'}`}
  >
    {children}
  </button>
);

/** The buttons along the top of the site. */
export const Toolbar = ({ children }: { children: ReactNode }) => (
  <div className="absolute inset-x-0 top-5 z-10 flex items-center justify-center gap-2">
    {children}
  </div>
);

/** Rain that fades in, falls from the top right to the bottom left, and fades out. */
export function Rain() {
  const [drops] = useState(() =>
    Array.from({ length: 80 }, () => ({
      left: Math.random() * 140,
      delay: Math.random() * 1.6,
      duration: 0.9 + Math.random() * 0.6,
    })),
  );
  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 1.2 }}
    >
      {drops.map((drop, index) => (
        <motion.span
          key={index}
          className="absolute -top-8 h-5 w-px rotate-[22deg] bg-foreground/35"
          style={{ left: `${drop.left}%` }}
          initial={{ y: 0, x: 0 }}
          animate={{ y: '110vh', x: -340 }}
          transition={{
            duration: drop.duration,
            delay: drop.delay,
            repeat: Infinity,
            ease: 'linear',
          }}
        />
      ))}
    </motion.div>
  );
}
