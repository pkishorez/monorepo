import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { View } from '@kestack/kabuki/react';
import type { Snapshot } from '@kestack/kabuki';

/*
 * What is inside the app at the step shown: every Actor, as a card with
 * its State, its Model and, while live, its running Workers. Children hang
 * under their parent. A card arrives and leaves as its Actor does, and a
 * value that changes lights up, so a Message shows what it touched. A
 * card with many fields starts folded, so the tree stays in view.
 */

/** More fields than this, and a card starts folded. */
const MOST_FIELDS = 6;

/** Arriving and leaving, as the pictures do. */
const ENTER = { duration: 0.25, ease: [0.23, 1, 0.32, 1] } as const;
const EXIT = { duration: 0.15, ease: [0.4, 0, 1, 1] } as const;

export function Inside({ runtime }: { readonly runtime: View.AppRuntime }) {
  const { history, head, shown } = runtime;
  const snapshot = history.snapshotAt(
    shown === null ? head : shown === 'init' ? null : shown,
  );
  return (
    <section
      aria-label="Inside the app"
      className="min-h-0 overflow-y-auto border-t border-border bg-muted/30 p-3 sm:border-t-0 sm:border-l"
    >
      <h3 className="mb-2 px-1 text-xs font-medium text-muted-foreground">
        Inside
      </h3>
      <Card instance={snapshot} runtime={runtime} />
    </section>
  );
}

function Card({
  instance,
  runtime,
}: {
  readonly instance: Snapshot.Instance;
  readonly runtime: View.AppRuntime;
}) {
  const workers =
    runtime.shown === null
      ? runtime.workers(instance.id).filter((w) => w.status === 'running')
      : [];
  const kids = Object.values(instance.children).flat();
  const model = entriesOf(instance.model);
  const props = entriesOf(instance.props);
  const fields = model.length + props.length;
  // A Model too big to read at a glance, like the Router's, starts folded.
  const [open, setOpen] = useState(fields <= MOST_FIELDS);
  return (
    <div className="space-y-1.5 font-mono text-[11px]">
      <div className="rounded-md border border-border bg-background px-2.5 py-2 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate font-sans text-xs font-medium">
            {instance.actor}
            {instance.key !== undefined && (
              <span className="text-muted-foreground"> · {instance.key}</span>
            )}
          </span>
          {instance.state._tag !== 'Single' && (
            <Lit value={instance.state._tag}>
              <span className="rounded-full bg-foreground px-2 py-0.5 text-background">
                {instance.state._tag}
              </span>
            </Lit>
          )}
        </div>
        {fields > MOST_FIELDS && (
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
            className="mt-1.5 text-muted-foreground hover:text-foreground"
          >
            {open ? '▾' : '▸'} {fields} fields
          </button>
        )}
        {fields > 0 && open && (
          <dl className="mt-1.5 space-y-0.5">
            {model.map(([key, value]) => (
              <Row key={key} name={key} value={value} />
            ))}
            {props.map(([key, value]) => (
              <Row key={`props.${key}`} name={`props.${key}`} value={value} />
            ))}
          </dl>
        )}
        <AnimatePresence initial={false}>
          {workers.map((worker) => (
            <motion.p
              key={`${worker.name}:${worker.key}`}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto', transition: ENTER }}
              exit={{ opacity: 0, height: 0, transition: EXIT }}
              className="flex items-center gap-1.5 overflow-hidden pt-1 text-emerald-600 dark:text-emerald-400"
            >
              <span className="size-1.5 animate-pulse rounded-full bg-current" />
              {worker.name}
              {worker.key && ` · ${worker.key}`}
            </motion.p>
          ))}
        </AnimatePresence>
      </div>
      {kids.length > 0 && (
        <div className="ml-2 space-y-1.5 border-l border-border pl-2">
          <AnimatePresence initial={false}>
            {kids.map((kid) => (
              <motion.div
                key={kid.id}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0, transition: ENTER }}
                exit={{ opacity: 0, transition: EXIT }}
              >
                <Card instance={kid} runtime={runtime} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

function Row({
  name,
  value,
}: {
  readonly name: string;
  readonly value: unknown;
}) {
  const text = show(value);
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 text-muted-foreground">{name}</dt>
      <Lit value={text}>
        <dd className="min-w-0 truncate rounded px-0.5">{text}</dd>
      </Lit>
    </div>
  );
}

/** What it wraps, lit up for a moment each time `value` changes, not when it first draws. */
function Lit({
  value,
  children,
}: {
  readonly value: string;
  readonly children: ReactElement;
}) {
  const drawn = useRef(false);
  useEffect(() => {
    drawn.current = true;
  }, []);
  return (
    <motion.span
      key={value}
      initial={
        drawn.current ? { backgroundColor: 'rgba(16, 185, 129, 0.25)' } : false
      }
      animate={{ backgroundColor: 'rgba(16, 185, 129, 0)' }}
      transition={{ duration: 0.9, ease: 'easeOut' }}
      className="min-w-0 rounded"
    >
      {children}
    </motion.span>
  );
}

const entriesOf = (value: unknown): ReadonlyArray<[string, unknown]> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? Object.entries(value)
    : value === undefined
      ? []
      : [['value', value]];

const show = (value: unknown): string =>
  typeof value === 'string' ? `"${value}"` : (JSON.stringify(value) ?? '');
