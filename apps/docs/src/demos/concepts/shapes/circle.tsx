import { useRef } from 'react';
import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { SOURCE } from './sources.js';

/** A Worker whose Condition holds, by name and, for an `each` Worker, its key. */
export interface Ring {
  readonly name: string;
  readonly key?: string;
}

/** Which side of the Picture a Path goes to. */
export type Edge = 'top' | 'right' | 'bottom' | 'left';

const SPRING = { type: 'spring', stiffness: 400, damping: 30 } as const;

/**
 * Counts how often `value` changed between renders, so a pulse keyed on the
 * Model plays once per change. Written during render on purpose: it only
 * compares props, so a render React throws away cannot leave it wrong.
 */
const useBeat = (value: unknown) => {
  const last = useRef({ value, beat: 0 });
  if (!Object.is(last.current.value, value))
    last.current = { value, beat: last.current.beat + 1 };
  return last.current.beat;
};

/** The gap from the Circle to its first Ring, and between Rings, in pixels. */
const GAP = 7;

/**
 * An Instance: a circle with its data written inside. Clicking it Sends the
 * Instance's main Message; it pulses when `pulse` changes (pass the Model or
 * the State). Rings orbit it for each running Worker, with a legend of their
 * names beside it, and a Path leaves it for the Edge while a Command runs.
 * The box grows with its Rings, so what holds the Circle grows too. The
 * element at the Circle's centre carries `data-instance={id}`.
 */
export const Circle = ({
  id,
  children,
  onClick,
  pulse,
  rings = [],
  path,
  edge = 'top',
  size = 64,
}: {
  readonly id: string;
  /** The text inside: the Model data. */
  readonly children?: ReactNode;
  /** The Instance's main Message, Sent on click. */
  readonly onClick?: () => void;
  /** Pulses once each time this value changes: the Model, or the State. */
  readonly pulse?: unknown;
  /** One Ring per Worker whose Condition holds, from the Model and State. */
  readonly rings?: ReadonlyArray<Ring>;
  /** The name of each Command running, from the Model: one Path each. */
  readonly path?: string | ReadonlyArray<string>;
  /** Which Edge the Paths go to. */
  readonly edge?: Edge;
  /** The diameter in pixels. */
  readonly size?: number;
}) => {
  const beat = useBeat(pulse);
  const paths =
    path === undefined ? [] : typeof path === 'string' ? [path] : path;
  const reach = rings.length * GAP;
  return (
    <div className="flex shrink-0 items-center">
      <motion.div
        layout
        data-instance={id}
        className="grid shrink-0 place-items-center"
        style={{ width: size + 2 * reach, height: size + 2 * reach }}
      >
        <div className="relative" style={{ width: size, height: size }}>
          <AnimatePresence>
            {paths.map((name) => (
              <Path key={name} name={name} edge={edge} />
            ))}
          </AnimatePresence>
          <AnimatePresence>
            {rings.map((ring, index) => (
              <RingShape
                key={`${ring.name}/${ring.key ?? ''}`}
                instance={id}
                ring={ring}
                inset={-(index + 1) * GAP}
              />
            ))}
          </AnimatePresence>
          <motion.button
            type="button"
            onClick={onClick}
            whileTap={onClick ? { scale: 0.94 } : undefined}
            transition={SPRING}
            className={`relative z-10 size-full rounded-full border-2 border-foreground bg-background px-1 font-mono text-xs leading-tight tabular-nums text-foreground ${onClick ? 'cursor-pointer' : 'cursor-default'}`}
          >
            {children}
          </motion.button>
          {beat > 0 && (
            <motion.span
              key={beat}
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-full border-2 border-foreground"
              initial={{ scale: 1, opacity: 0.7 }}
              animate={{ scale: 1.7, opacity: 0 }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
            />
          )}
        </div>
      </motion.div>
      <AnimatePresence>
        {rings.length > 0 && (
          <motion.ul
            layout
            className="ml-1 flex flex-col gap-0.5"
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: 'auto' }}
            exit={{ opacity: 0, width: 0 }}
            transition={SPRING}
          >
            <AnimatePresence>
              {rings.map((ring) => (
                <motion.li
                  key={`${ring.name}/${ring.key ?? ''}`}
                  className="flex items-center gap-1 font-mono text-[10px] leading-none whitespace-nowrap"
                  style={{ color: SOURCE.worker.color }}
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -4 }}
                  transition={SPRING}
                >
                  <span
                    aria-hidden
                    className="size-1.5 rounded-full"
                    style={{ background: SOURCE.worker.color }}
                  />
                  {ring.name}
                  {ring.key !== undefined && `·${ring.key}`}
                </motion.li>
              ))}
            </AnimatePresence>
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
};

/** A Worker while its Condition holds: a dashed ring orbiting the Circle; its name is in the legend beside it. */
const RingShape = ({
  instance,
  ring,
  inset,
}: {
  readonly instance: string;
  readonly ring: Ring;
  readonly inset: number;
}) => (
  <motion.div
    data-worker={`${instance}/${ring.name}/${ring.key ?? ''}`}
    className="pointer-events-none absolute rounded-full"
    style={{ inset }}
    initial={{ scale: 0.6, opacity: 0 }}
    animate={{ scale: 1, opacity: 1 }}
    exit={{ scale: 0.6, opacity: 0 }}
    transition={SPRING}
  >
    <motion.div
      className="size-full rounded-full border border-dashed"
      style={{ borderColor: SOURCE.worker.color }}
      animate={{ rotate: 360 }}
      transition={{ repeat: Infinity, duration: 8, ease: 'linear' }}
    />
  </motion.div>
);

const TOWARDS: Record<Edge, string> = {
  top: 'bottom-full left-1/2 h-[100vh] w-0 border-l',
  bottom: 'top-full left-1/2 h-[100vh] w-0 border-l',
  right: 'left-full top-1/2 w-[100vw] h-0 border-t',
  left: 'right-full top-1/2 w-[100vw] h-0 border-t',
};

const TAG: Record<Edge, string> = {
  top: 'bottom-2 left-1.5',
  bottom: 'top-2 left-1.5',
  right: 'left-2 bottom-1',
  left: 'right-2 bottom-1',
};

/** A Command while it runs: a dashed line from the Circle to the Edge, tagged with its name. */
const Path = ({
  name,
  edge,
}: {
  readonly name: string;
  readonly edge: Edge;
}) => (
  <motion.div
    data-path={name}
    className={`pointer-events-none absolute border-dashed ${TOWARDS[edge]}`}
    style={{ borderColor: SOURCE.command.color }}
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    transition={{ duration: 0.2 }}
  >
    <span
      className={`absolute font-mono text-[10px] leading-none whitespace-nowrap ${TAG[edge]}`}
      style={{ color: SOURCE.command.color }}
    >
      {name}
    </span>
  </motion.div>
);
