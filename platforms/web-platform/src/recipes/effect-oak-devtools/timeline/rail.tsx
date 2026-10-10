import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { GitBranchPlus, Info } from '#lib/lucide';
import { KIND_LABEL, kindOf } from '../step/index.ts';
import type { Kind, Step } from '../step/index.ts';
import type { Inspection } from '../inspection/index.ts';
import { lanesOf } from './lanes/index.ts';
import type { Lane } from './lanes/index.ts';

const ROW = 28;
const LANE = 14;
const EASE_OUT = [0.23, 1, 0.32, 1] as const;
const MOVE = { duration: 0.3, ease: EASE_OUT } as const;

/** Lanes run right from the middle, where the first Branch is. */
const x = (lane: number) => lane * LANE;
const y = (row: number) => row * ROW + ROW / 2;
const PAD = 8;
/** Rows drawn beyond each edge of what is in sight. */
const OVERSCAN = 10;

/**
 * Three looks, never confused: a Step on the Branch in view up to the one
 * shown is solid; one after it is hollow on a dashed line, still to come; a
 * Step on another Branch is a small grey dot in its own lane, named on hover.
 * The row picked offers Inspect and, away from the Head, Fork here; the Head
 * stays marked forked until the next Message grows the new Branch. Only the
 * rows in sight are drawn, so a long Log costs no more than a short one.
 */
export const Rail = ({ inspection }: { readonly inspection: Inspection }) => {
  const { step, view, live, runtime } = inspection;
  const { entries } = inspection;
  const { rows } = useMemo(() => lanesOf(entries), [entries]);
  const position = useMemo(
    () => new Map<Step, number>(view.map((entry, index) => [entry, index])),
    [view],
  );
  const reached = step === 'init' ? -1 : (position.get(step) ?? -1);
  const later = (at: Step) => (position.get(at) ?? -1) > reached;
  const onView = (at: Step) => at === 'init' || position.has(at);
  const scroller = useRef<HTMLDivElement>(null);
  const selectedRow = rows.findIndex((row) => row.step === step);
  // Only the newest rows, as many as the limit, and always the one shown.
  const count =
    inspection.limit === null
      ? rows.length
      : Math.min(rows.length, Math.max(inspection.limit, selectedRow + 1));
  const [sight, setSight] = useState({ top: 0, height: 800 });
  const from = Math.max(0, Math.floor((sight.top - PAD) / ROW) - OVERSCAN);
  const to = Math.min(
    count,
    Math.ceil((sight.top + sight.height) / ROW) + OVERSCAN,
  );

  // What is in sight follows the scroll and the size of the box, at most
  // once a frame.
  useEffect(() => {
    const box = scroller.current!;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() =>
        setSight({ top: box.scrollTop, height: box.clientHeight }),
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    box.addEventListener('scroll', measure, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      box.removeEventListener('scroll', measure);
    };
  }, []);

  // Keep the Step shown in sight, and the focus on it, as it moves.
  useEffect(() => {
    const box = scroller.current;
    if (!box || selectedRow === -1) return;
    const top = PAD + selectedRow * ROW;
    if (top < box.scrollTop) box.scrollTop = top - ROW;
    else if (top + ROW > box.scrollTop + box.clientHeight)
      box.scrollTop = top + 2 * ROW - box.clientHeight;
    if (box.contains(document.activeElement))
      box
        .querySelector<HTMLElement>('[aria-current="step"]')
        ?.focus({ preventScroll: true });
  }, [selectedRow]);

  return (
    <div className="flex h-full flex-col">
      <div
        ref={scroller}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        style={{ paddingBlock: PAD }}
      >
        <div className="relative" style={{ height: count * ROW }}>
          <svg
            aria-hidden
            className="pointer-events-none absolute top-0 left-1/2 overflow-visible"
            width={1}
            height={count * ROW}
          >
            {rows.map((row, index) =>
              row.parent && index <= to && row.parent.row >= from ? (
                <motion.path
                  key={`line-${key(row.step)}`}
                  initial={false}
                  animate={{ d: line(index, row, count) }}
                  transition={MOVE}
                  fill="none"
                  strokeWidth={onView(row.step) ? 1.5 : 1}
                  strokeDasharray={later(row.step) ? '3 3' : undefined}
                  className={`transition-[stroke] duration-300 ${
                    onView(row.step)
                      ? 'stroke-foreground/45'
                      : 'stroke-muted-foreground/25'
                  }`}
                />
              ) : null,
            )}
          </svg>
          <AnimatePresence initial={false}>
            {rows.slice(from, to).map((row, at) => {
              const index = from + at;
              const selected = row.step === step;
              const inView = onView(row.step);
              const ahead = later(row.step);
              const kind = kindOf(row.step, inspection.around(row.step));
              const missed = kind === 'ignored' || kind === 'dropped';
              const isHead =
                row.step !== 'init' &&
                row.step.id === runtime.head &&
                runtime.running &&
                live;
              const name = row.step === 'init' ? 'Init' : row.step.message._tag;
              const head =
                row.step === 'init'
                  ? runtime.head === null
                  : row.step.id === runtime.head;
              // Forked: live from a Step that already has a Message after it.
              const forked =
                head &&
                live &&
                runtime.running &&
                runtime.children(row.step === 'init' ? null : row.step.id)
                  .length > 0;
              return (
                <motion.div
                  key={key(row.step)}
                  initial={{ opacity: 0, y: y(index) - ROW / 2 - 8 }}
                  animate={{ opacity: 1, y: y(index) - ROW / 2 }}
                  exit={{ opacity: 0, transition: { duration: 0.12 } }}
                  transition={MOVE}
                  className="group absolute inset-x-0 top-0"
                  style={{ height: ROW }}
                >
                  <button
                    type="button"
                    onClick={() => inspection.show(row.step)}
                    aria-current={selected ? 'step' : undefined}
                    aria-label={
                      inView ? undefined : `${name}, on another Branch`
                    }
                    className="group/row absolute inset-0 text-left outline-none"
                  >
                    <span
                      className={`absolute inset-y-0.5 right-2 left-2 rounded-md transition-colors duration-150 ${selected ? 'bg-muted' : 'group-hover:bg-muted/50'} group-focus-visible/row:ring-2 group-focus-visible/row:ring-ring`}
                    />
                    <span
                      className={`absolute top-0 left-3 flex h-full items-center justify-end truncate pr-4 text-[13px] transition-opacity duration-150 ${
                        !inView
                          ? 'text-muted-foreground opacity-0 group-hover:opacity-100 group-focus-visible/row:opacity-100'
                          : missed
                            ? 'text-muted-foreground line-through'
                            : ahead
                              ? 'text-muted-foreground'
                              : selected
                                ? 'font-medium text-foreground'
                                : 'text-foreground/85'
                      }`}
                      style={{ right: '50%' }}
                    >
                      {name}
                    </span>
                    <Dot
                      kind={kind}
                      left={x(row.lane)}
                      look={!inView ? 'other' : ahead ? 'ahead' : 'reached'}
                      selected={selected}
                      head={isHead}
                    />
                  </button>
                  {(selected || forked) && (
                    <span className="absolute inset-y-0 right-3 flex items-center gap-0.5">
                      {forked ? (
                        <span
                          title="Forked: the next Message starts a new Branch here"
                          className="flex size-6 items-center justify-center rounded-md bg-primary/10 text-primary"
                        >
                          <GitBranchPlus className="size-3.5" />
                        </span>
                      ) : (
                        !head && (
                          <RowAction
                            label="Fork here"
                            hint="Go live from here; the next Message starts a new Branch"
                            onClick={inspection.fork}
                          >
                            <GitBranchPlus className="size-3.5" />
                          </RowAction>
                        )
                      )}
                      {selected && (
                        <RowAction
                          label="Inspect"
                          hint="Open this Step in the Inspector"
                          onClick={() => inspection.setTab('inspector')}
                        >
                          <Info className="size-3.5" />
                        </RowAction>
                      )}
                    </span>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>
      {count < rows.length || inspection.limit !== LIMITS[0] ? (
        <Limit inspection={inspection} shown={count} total={rows.length} />
      ) : null}
    </div>
  );
};

const RowAction = ({
  label,
  hint,
  onClick,
  children,
}: {
  readonly label: string;
  readonly hint: string;
  readonly onClick: () => void;
  readonly children: ReactNode;
}) => (
  <button
    type="button"
    aria-label={label}
    title={hint}
    onClick={onClick}
    className="flex size-6 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors duration-150 hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
  >
    {children}
  </button>
);

const LIMITS = [50, 200, 1000, null] as const;

/** How many rows show, of how many, and a choice of more or fewer. */
const Limit = ({
  inspection,
  shown,
  total,
}: {
  readonly inspection: Inspection;
  readonly shown: number;
  readonly total: number;
}) => (
  <label className="flex h-9 shrink-0 items-center justify-center gap-2 border-t text-xs text-muted-foreground">
    <span className="tabular-nums">
      Newest {shown.toLocaleString()} of {total.toLocaleString()}
    </span>
    <select
      aria-label="How many Messages to show"
      value={inspection.limit ?? 'all'}
      onChange={(event) =>
        inspection.setLimit(
          event.target.value === 'all' ? null : Number(event.target.value),
        )
      }
      className="rounded-md border bg-background px-1.5 py-0.5 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {LIMITS.map((limit) => (
        <option key={limit ?? 'all'} value={limit ?? 'all'}>
          {limit === null ? 'Show all' : `Show ${limit.toLocaleString()}`}
        </option>
      ))}
    </select>
  </label>
);

const key = (step: Step) => (step === 'init' ? 'init' : step.id);

/**
 * The line from a row down to the row before it, bending into its lane; one
 * whose row is past the last shown runs straight off the bottom.
 */
const line = (index: number, { lane, parent }: Lane, count: number) => {
  const from = x(lane);
  if (parent!.row >= count)
    return `M ${from} ${y(index)} L ${from} ${count * ROW}`;
  const to = x(parent!.lane);
  const top = y(index);
  const bottom = y(parent!.row);
  const bend = bottom - ROW;
  return `M ${from} ${top} L ${from} ${bend} C ${from} ${bend + ROW / 2}, ${to} ${bend + ROW / 2}, ${to} ${bottom}`;
};

const Dot = ({
  kind,
  left,
  look,
  selected,
  head,
}: {
  readonly kind: Kind;
  readonly left: number;
  readonly look: 'reached' | 'ahead' | 'other';
  readonly selected: boolean;
  readonly head: boolean;
}) => (
  <motion.span
    title={KIND_LABEL[kind]}
    initial={false}
    animate={{ x: left, scale: selected ? 1.4 : 1 }}
    transition={MOVE}
    className="absolute top-1/2 left-1/2 -mt-1 -ml-1 flex size-2 items-center justify-center"
  >
    {head && (
      <span className="absolute size-4 animate-ping rounded-full bg-positive/40 motion-reduce:animate-none" />
    )}
    <span
      className={`relative block ${
        look === 'other'
          ? 'size-1.5 rounded-full bg-muted-foreground/50'
          : look === 'ahead'
            ? `${SHAPE[kind]} border border-foreground/50 bg-background`
            : DOT[kind]
      } ${selected ? 'ring-2 ring-primary/40 ring-offset-1 ring-offset-background' : ''}`}
    />
  </motion.span>
);

const SHAPE: Record<Kind, string> = {
  init: 'size-2.5 rotate-45 rounded-[2px]',
  transition: 'size-2.5 rounded-full',
  update: 'size-2 rounded-full',
  still: 'size-1.5 rounded-full',
  ignored: 'size-2 rounded-full',
  dropped: 'size-2 rounded-full',
};

const DOT: Record<Kind, string> = {
  init: `${SHAPE.init} bg-foreground`,
  transition: `${SHAPE.transition} bg-primary`,
  update: `${SHAPE.update} bg-foreground`,
  still: `${SHAPE.still} bg-muted-foreground`,
  ignored: `${SHAPE.ignored} border border-muted-foreground bg-background`,
  dropped: `${SHAPE.dropped} border border-dashed border-muted-foreground bg-background`,
};
