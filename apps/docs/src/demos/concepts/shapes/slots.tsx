import type { ReactNode } from 'react';
import { motion } from 'motion/react';

const SPRING = { type: 'spring', stiffness: 300, damping: 30 } as const;

/**
 * An Actor with States: a rounded rectangle split into one Slot per State,
 * each labelled, with the lit Slot holding the children (the Circle, and its
 * Lines) and the State data written under them. A Transition slides them to
 * the next Slot.
 */
export const Slots = ({
  name,
  states,
  lit,
  data,
  children,
}: {
  /** The Actor's name, written on the border. */
  readonly name?: string;
  /** Every State, in order: `Actor.definition.states`. */
  readonly states: ReadonlyArray<string>;
  /** The current State's tag: `_tag`. */
  readonly lit: string;
  /** The State data, written in the lit Slot. */
  readonly data?: ReactNode;
  /** The Circle, and its Lines if the State Invokes Children. */
  readonly children: ReactNode;
}) => {
  const column = Math.max(0, states.indexOf(lit)) + 1;
  return (
    <div className="relative rounded-2xl border bg-background">
      {name && (
        <span className="absolute -top-2 left-3 bg-background px-1 font-mono text-[10px] leading-none text-muted-foreground">
          {name}
        </span>
      )}
      <div
        className="grid"
        style={{
          gridTemplateColumns: `repeat(${states.length}, minmax(9rem, 1fr))`,
        }}
      >
        <motion.div
          layout
          transition={SPRING}
          className="rounded-2xl bg-foreground/5"
          style={{ gridColumn: column, gridRow: '1 / 3' }}
        />
        {states.map((state, index) => (
          <div
            key={state}
            data-slot={state}
            className={`relative px-4 pt-3 pb-1 text-center font-mono text-xs ${state === lit ? 'text-foreground' : 'text-muted-foreground'} ${index > 0 ? 'border-l' : ''}`}
            style={{ gridColumn: index + 1, gridRow: 1 }}
          >
            {state}
          </div>
        ))}
        <motion.div
          layout
          transition={SPRING}
          className="relative flex flex-col items-center gap-3 px-4 pt-3 pb-5"
          style={{ gridColumn: column, gridRow: 2 }}
        >
          {children}
          {data !== undefined && data !== null && (
            <div className="font-mono text-xs text-muted-foreground tabular-nums">
              {data}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
};
