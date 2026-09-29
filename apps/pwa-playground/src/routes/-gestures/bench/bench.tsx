import { useHold } from '@kstackz/ui-toolkit/components/blocks/gestures';
import { animate, motion, useMotionValue } from '@kstackz/ui-toolkit/motion';
import { cn } from '@kstackz/ui-toolkit/utils';
import {
  createContext,
  type ReactNode,
  type RefObject,
  useCallback,
  useContext,
  useState,
} from 'react';

const LOG_SIZE = 6;

const SPRING = { type: 'spring', stiffness: 420, damping: 34 } as const;

/** A number with its sign, rounded. */
export const signed = (value: number, unit = '') =>
  `${value > 0 ? '+' : ''}${Math.round(value)}${unit}`;

const LogContext = createContext<(line: string) => void>(() => undefined);

/** Adds a line to the bench's log. */
export const useNote = () => useContext(LogContext);

/**
 * The puck a lane moves: its own motion values, set while a Gesture runs and
 * sprung home when it ends.
 */
export const usePuck = () => {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const scale = useMotionValue(1);
  const rotate = useMotionValue(0);
  const home = useCallback(() => {
    void animate(x, 0, SPRING);
    void animate(y, 0, SPRING);
    void animate(scale, 1, SPRING);
    void animate(rotate, 0, SPRING);
  }, [x, y, scale, rotate]);
  return { x, y, scale, rotate, home };
};

export type Puck = ReturnType<typeof usePuck>;

export function PuckShape(props: {
  readonly puck: Puck;
  readonly hold: boolean;
  readonly active: boolean;
}) {
  const { x, y, scale, rotate } = props.puck;
  return (
    <motion.div
      aria-hidden="true"
      style={{ x, y, scale, rotate }}
      className={cn(
        'flex size-14 items-center justify-center rounded-xl border-2 font-mono text-[10px] shadow-sm transition-colors',
        props.hold
          ? 'border-amber-500 text-amber-600 dark:text-amber-400'
          : 'border-primary text-primary',
        props.active &&
          (props.hold
            ? 'bg-amber-500 text-black dark:text-black'
            : 'bg-primary text-primary-foreground'),
      )}
    >
      ▲
    </motion.div>
  );
}

/**
 * One hook under test: its call as the title, what it moves, a live
 * readout, and a highlight while it is Active.
 */
export function Lane(props: {
  readonly title: string;
  readonly hold: boolean;
  readonly active: boolean;
  readonly readout: RefObject<HTMLSpanElement | null>;
  readonly badge?: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <section
      data-testid={`lane-${props.hold ? 'hold' : 'plain'}`}
      data-active={props.active ? '' : undefined}
      className={cn(
        'relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border p-3 transition-colors',
        props.active
          ? props.hold
            ? 'border-amber-500 bg-amber-500/5'
            : 'border-primary bg-primary/5'
          : 'border-border',
      )}
    >
      <header className="relative z-10 flex items-baseline justify-between gap-2">
        <code className="text-xs font-semibold">{props.title}</code>
        {props.badge}
      </header>
      <span
        ref={props.readout}
        className="relative z-10 font-mono text-[11px] text-muted-foreground tabular-nums"
      >
        waiting
      </span>
      <div className="flex min-h-0 flex-1 items-center justify-center">
        {props.children}
      </div>
    </section>
  );
}

/**
 * A bench: what it tests and how the Hold starts here, the Hold's state,
 * the two lanes (no Hold above, Hold below) and a log of every Gesture
 * read.
 */
export function Bench(props: {
  readonly how: string;
  readonly children: ReactNode;
}) {
  const hold = useHold();
  const [log, setLog] = useState<ReadonlyArray<string>>([]);
  const note = useCallback(
    (line: string) => setLog((lines) => [line, ...lines].slice(0, LOG_SIZE)),
    [],
  );
  return (
    <LogContext value={note}>
      <div className="flex h-full flex-col gap-2 p-3">
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs text-balance text-muted-foreground">
            {props.how}
          </p>
          <span
            data-testid="hold-state"
            className={cn(
              'shrink-0 rounded-full border px-2 py-0.5 font-mono text-[11px]',
              hold
                ? 'border-amber-500 bg-amber-500 text-black'
                : 'border-border text-muted-foreground',
            )}
          >
            Hold {hold ? 'on' : 'off'}
          </span>
        </div>
        {props.children}
        <ol
          data-testid="bench-log"
          className="h-[6.75rem] shrink-0 overflow-hidden rounded-lg border border-border px-3 py-1.5 font-mono text-[11px] leading-4"
        >
          {log.length === 0 && (
            <li className="text-muted-foreground">
              Every Gesture read shows here
            </li>
          )}
          {log.map((line, at) => (
            <li
              key={`${log.length - at}`}
              className={cn('truncate', at > 0 && 'text-muted-foreground')}
            >
              {line}
            </li>
          ))}
        </ol>
      </div>
    </LogContext>
  );
}
