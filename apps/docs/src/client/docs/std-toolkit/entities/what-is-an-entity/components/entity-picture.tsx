import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import {
  ENTER,
  EXIT,
  Flash,
  Pill,
  Walkthrough,
  useWalkthrough,
} from '../../../../../components/index.ts';

/*
 * An entity, put together. First the shape a task has; then the key that
 * finds one; then the table it lives in. The three join into one entity,
 * `task`, with its calls. Last, a save gives back an Entity: the value,
 * and the meta the toolkit keeps beside it. Every piece has its place
 * from the start and only fades in there, so the picture never grows.
 */

const CAPTIONS = [
  'First, a shape: what a task is. Here, Task at its latest version, v3.',
  'Then a key: how to find one task. A board and a task id will do.',
  'And a table: where tasks are kept. This one is called board.',
  'Put together, the three make an entity, task, with the calls a list needs.',
  'A save gives back an Entity: your task as its value, and the toolkit’s notes as meta.',
];

/** Fades a part in once the walkthrough reaches its step. */
function Reveal({
  shown,
  className,
  children,
}: {
  readonly shown: boolean;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  return (
    <motion.div
      initial={false}
      animate={shown ? { opacity: 1, y: 0 } : { opacity: 0, y: 6 }}
      transition={shown ? ENTER : EXIT}
      aria-hidden={!shown}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function Piece({
  label,
  shown,
  children,
}: {
  readonly label: string;
  readonly shown: boolean;
  readonly children: ReactNode;
}) {
  return (
    <Reveal
      shown={shown}
      className="rounded-lg border border-border bg-background px-3 py-2 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
    >
      <p className="mb-1 text-[11px] font-medium text-muted-foreground">
        {label}
      </p>
      <div className="font-mono text-[11.5px] leading-5">{children}</div>
    </Reveal>
  );
}

export function EntityPicture() {
  const walk = useWalkthrough(CAPTIONS);
  const { step, round } = walk;
  return (
    <Walkthrough walk={walk}>
      <div className="px-4 py-8 sm:px-8">
        <div className="mx-auto grid max-w-xl grid-cols-3 gap-2 sm:gap-3">
          <Piece label="a shape" shown={step >= 0}>
            Task
            <span className="text-muted-foreground"> · v3</span>
          </Piece>
          <Piece label="a key" shown={step >= 1}>
            <span className="whitespace-nowrap">boardId</span>
            <span className="text-muted-foreground"> + </span>
            <span className="whitespace-nowrap">taskId</span>
          </Piece>
          <Piece label="a table" shown={step >= 2}>
            'board'
          </Piece>
        </div>
        <div className="mx-auto mt-4 flex max-w-xl flex-col items-center gap-3">
          <Reveal
            shown={step >= 3}
            className="relative flex flex-wrap items-center justify-center gap-1.5 rounded-xl border-2 border-foreground/80 bg-background px-3 py-2"
          >
            <span className="mr-1 text-sm font-semibold">task</span>
            {['insert', 'get', 'query', 'getAndUpdate', 'delete'].map(
              (call) => (
                <Pill key={call} className="font-mono text-[10.5px]">
                  {call}
                </Pill>
              ),
            )}
            <Flash {...(step === 3 ? { at: round * 10 + 1 } : {})} />
          </Reveal>
          <Reveal
            shown={step >= 4}
            className="relative grid w-full max-w-sm grid-cols-2 gap-3 rounded-lg border border-border bg-background px-3 py-2 font-mono text-[11px] leading-5"
          >
            <div>
              <p className="mb-0.5 font-sans font-medium text-muted-foreground">
                value
              </p>
              <p>taskId 't1'</p>
              <p className="whitespace-nowrap">title 'Plan the week'</p>
              <p>priority 'low'</p>
              <p>done false</p>
            </div>
            <div>
              <p className="mb-0.5 font-sans font-medium text-muted-foreground">
                meta
              </p>
              <p>_e 'Task'</p>
              <p>_v 'v3'</p>
              <p>_u '01J8…A1'</p>
              <p>_d false</p>
            </div>
            <Flash {...(step === 4 ? { at: round * 10 + 2 } : {})} />
          </Reveal>
        </div>
      </div>
    </Walkthrough>
  );
}
