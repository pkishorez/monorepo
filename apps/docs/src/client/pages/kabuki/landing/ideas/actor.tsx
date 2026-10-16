import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import { Cursor, Flash, Roll, useSteps, useTargets } from './parts.tsx';

/*
 * Actor is the building block: a Counter, and the View it draws, as one
 * loop. A pointer glides to a button in the View and clicks it. The
 * button's Message travels up its lane into the Counter; as it sinks in,
 * the count moves and the new count travels down the middle into the
 * View, which draws it as it lands. Both trips are the same trip, edge to
 * edge on the same curve, so the loop reads as one motion. The pointer
 * stays on its button until the next click. Up twice, down twice, and
 * around again.
 */

const MESSAGES = [
  { name: 'Incremented', by: 1, button: 'plus' },
  { name: 'Incremented', by: 1, button: 'plus' },
  { name: 'Decremented', by: -1, button: 'minus' },
  { name: 'Decremented', by: -1, button: 'minus' },
] as const;
const START = 2;
/** One trip between the cards, up or down: how long, and how far past each edge. */
const TRIP = 0.44;
const INSET = 6;
/**
 * Each Message: the pointer glides to its button and presses it, the
 * Message travels up, the new count travels down, and the View holds.
 */
const PHASES = [700, 160, TRIP * 1000, TRIP * 1000, 1500];
const STEPS = MESSAGES.flatMap(() => PHASES);

export function Actor() {
  const [ref, step, round] = useSteps(STEPS, 4);
  const targets = useTargets(ref);
  const index = Math.floor(step / PHASES.length);
  const phase = step % PHASES.length;
  const message = MESSAGES[index]!;
  const before =
    START + MESSAGES.slice(0, index).reduce((sum, m) => sum + m.by, 0);
  const after = before + message.by;
  const updates = round * MESSAGES.length + index;
  const button = targets[message.button];
  const out = targets['out'];
  const into = targets['in'];
  const key = `${round}-${index}`;
  return (
    <div ref={ref} className="relative w-full max-w-72">
      <Card label="Actor">
        <span className="text-sm font-medium">Counter</span>
        <span className="font-mono text-xs text-muted-foreground">
          {'{ count: '}
          <Roll
            value={phase >= 3 ? after : before}
            className="text-foreground"
          />
          {' }'}
        </span>
        <span data-target="out" className="absolute bottom-0 left-1/2" />
        <Flash at={phase >= 3 ? updates + 1 : updates} />
      </Card>

      {/* The loop between them: Messages up the sides, drawing down the middle. */}
      <div className="relative h-16">
        {out && into && (
          <>
            {(['minus', 'plus'] as const).map((lane) => {
              const at = targets[lane];
              return (
                at && (
                  <span
                    key={lane}
                    className={`absolute top-0 bottom-0 border-l border-dashed transition-colors duration-300 ${
                      phase === 2 && lane === message.button
                        ? 'border-foreground/50'
                        : 'border-foreground/15'
                    }`}
                    style={{ left: at.x }}
                  />
                )
              );
            })}
            <span
              className={`absolute top-0 bottom-0 border-l transition-colors duration-300 ${
                phase === 3 ? 'border-foreground/50' : 'border-foreground/15'
              }`}
              style={{ left: out.x }}
            />
            <span
              className="absolute top-1/2 -translate-y-1/2 pl-2 font-mono text-[10px] text-muted-foreground"
              style={{ left: out.x }}
            >
              draws
            </span>
          </>
        )}
      </div>

      <Card label="View">
        {(['minus', 'plus'] as const).map((name) => {
          const down = phase === 1 && name === message.button;
          return (
            <motion.span
              key={name}
              data-target={name}
              animate={{ scale: down ? 0.9 : 1 }}
              transition={
                down
                  ? { duration: 0.1, ease: 'easeOut' }
                  : { type: 'spring', stiffness: 500, damping: 26 }
              }
              className={`grid size-9 place-items-center rounded-lg border font-mono text-base transition-colors duration-150 ${
                name === 'plus' ? 'order-3' : ''
              } ${down ? 'border-foreground bg-muted' : 'border-border'}`}
            >
              {name === 'plus' ? '+' : '−'}
            </motion.span>
          );
        })}
        <Roll
          value={phase >= 4 ? after : before}
          className="order-2 text-3xl font-semibold"
        />
        <span data-target="in" className="absolute top-0 left-1/2" />
        <Flash at={phase >= 4 ? updates + 1 : updates} />
      </Card>

      {/* The Message going up, then the new count coming down. */}
      {phase === 2 && button && out && into && (
        <Trip
          key={`up-${key}`}
          x={button.x}
          from={into.y + INSET}
          to={out.y - INSET}
        >
          {message.name}
        </Trip>
      )}
      {phase === 3 && out && into && (
        <Trip
          key={`down-${key}`}
          x={out.x}
          from={out.y - INSET}
          to={into.y + INSET}
        >
          count: {after}
        </Trip>
      )}

      <Cursor
        at={button && { x: button.x + 3, y: button.y + 4 }}
        pressed={phase === 1}
        clicks={updates + (phase >= 1 ? 1 : 0)}
      />
    </div>
  );
}

/** One of the two halves: a card with its kind written in its corner. */
function Card({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="relative flex h-16 items-center justify-between gap-3 rounded-xl border border-border bg-background px-3 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_2px_8px_rgba(0,0,0,0.04)]">
      <span className="absolute -top-2 left-3 bg-background px-1 font-mono text-[10px] text-muted-foreground">
        {label}
      </span>
      {children}
    </div>
  );
}

/**
 * A chip making one trip between the cards: it comes out of one edge,
 * crosses, and goes into the other, fading in and out at the edges so it
 * seems to pass through them. Up and down use the same trip.
 */
function Trip({
  x,
  from,
  to,
  children,
}: {
  readonly x: number;
  readonly from: number;
  readonly to: number;
  readonly children: ReactNode;
}) {
  return (
    <motion.div
      className="pointer-events-none absolute top-0 left-0 z-[5]"
      initial={{ x, y: from, opacity: 0 }}
      animate={{ y: to, opacity: [0, 1, 1, 0] }}
      transition={{
        y: { duration: TRIP, ease: [0.45, 0, 0.55, 1] },
        opacity: { duration: TRIP, times: [0, 0.2, 0.8, 1], ease: 'linear' },
      }}
    >
      <span className="absolute -translate-x-1/2 -translate-y-1/2 rounded-md border border-foreground bg-background px-2 py-1 font-mono text-[11px] whitespace-nowrap shadow-sm">
        {children}
      </span>
    </motion.div>
  );
}
