import type { CSSProperties, ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';

const SPRING = { type: 'spring', stiffness: 300, damping: 30 } as const;

const PLAIN: CSSProperties = {
  '--line-width': '1px',
  '--line-color': 'var(--border)',
} as CSSProperties;

const BAND: CSSProperties = {
  '--line-width': '4px',
  '--line-color': 'color-mix(in oklch, var(--chart-9) 45%, transparent)',
} as CSSProperties;

/**
 * The tree under a Circle: a stem down from it and a bar across its Children,
 * each in a `Line`. With `band`, the Lines are drawn as a Band: the Capability
 * the parent Provides, named at the stem.
 */
export const Lines = ({
  band,
  children,
}: {
  /** The name of the Capability the parent's State Provides along these Lines. */
  readonly band?: string;
  /** One `Line` per Child, keyed by its Instance ID. */
  readonly children: ReactNode;
}) => (
  <div
    className="flex flex-col items-center"
    style={band === undefined ? PLAIN : BAND}
  >
    <div
      className="relative h-6 rounded-full"
      style={{ width: 'var(--line-width)', background: 'var(--line-color)' }}
    >
      {band !== undefined && (
        <span
          data-band={band}
          className="absolute top-1/2 left-2 -translate-y-1/2 font-mono text-[10px] leading-none whitespace-nowrap"
          style={{ color: 'var(--chart-9)' }}
        >
          {band}
        </span>
      )}
    </div>
    <div className="relative flex items-start">
      <div
        className="absolute top-0 right-12 left-12 rounded-full"
        style={{
          height: 'var(--line-width)',
          background: 'var(--line-color)',
        }}
      />
      <AnimatePresence initial={false}>{children}</AnimatePresence>
    </div>
  </div>
);

/** One Child at the end of its Line: it grows in when Invoked and shrinks out when stopped. */
export const Line = ({ children }: { readonly children: ReactNode }) => (
  <motion.div
    layout
    className="flex w-24 flex-col items-center"
    initial={{ scale: 0, opacity: 0 }}
    animate={{ scale: 1, opacity: 1 }}
    exit={{ scale: 0, opacity: 0 }}
    transition={SPRING}
    style={{ transformOrigin: 'top center' }}
  >
    <div
      className="h-6 rounded-full"
      style={{ width: 'var(--line-width)', background: 'var(--line-color)' }}
    />
    {children}
  </motion.div>
);
