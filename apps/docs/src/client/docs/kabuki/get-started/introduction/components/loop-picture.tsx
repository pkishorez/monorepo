import { motion } from 'motion/react';
import {
  Message,
  Roll,
  SPRING,
  useSteps,
} from '../../../../../components/index.ts';

/*
 * The one loop every kabuki app runs, as four stops on a line: the View
 * is clicked, it sends a Message, the Actor's Update makes the next
 * Model, and React draws it. A mark walks down the line, one stop at a
 * time, and the count moves when the Update runs and again when React
 * draws it. Then around again, one higher.
 */

const DURATIONS = [1300, 1300, 1300, 1900];
const STOPS = [
  { who: 'View', what: 'You press +' },
  { who: 'Message', what: 'The View sends one' },
  { who: 'Actor', what: 'Its Update makes the next Model' },
  { who: 'React', what: 'Draws the new Model' },
] as const;

export function LoopPicture() {
  const [ref, step, round] = useSteps(DURATIONS, 3);
  const count = round + 1;
  return (
    <div ref={ref} className="grid place-items-center px-4 py-8">
      <ol className="relative w-full max-w-80 space-y-2">
        <span
          aria-hidden
          className="absolute top-5 bottom-5 left-[1.1rem] w-px bg-border"
        />
        {STOPS.map((stop, index) => {
          const here = index === step;
          return (
            <li
              key={stop.who}
              className={`relative flex min-h-14 items-center gap-3 rounded-xl border px-3 transition-colors duration-300 ${
                here
                  ? 'border-foreground/40 bg-background'
                  : 'border-transparent'
              }`}
            >
              <span className="relative grid size-3 shrink-0 place-items-center">
                <span className="size-2 rounded-full bg-border" />
                {here && (
                  <motion.span
                    layoutId="loop-picture-mark"
                    transition={SPRING}
                    className="absolute size-3 rounded-full bg-foreground"
                  />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{stop.who}</span>
                <span className="block text-xs text-muted-foreground">
                  {stop.what}
                </span>
              </span>
              {index === 1 && <Message>Incremented</Message>}
              {index === 2 && (
                <span className="font-mono text-xs text-muted-foreground">
                  count:{' '}
                  <Roll
                    value={step >= 2 ? count + 1 : count}
                    className="text-foreground"
                  />
                </span>
              )}
              {index === 3 && (
                <Roll
                  value={step >= 3 ? count + 1 : count}
                  className="text-2xl font-semibold"
                />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
