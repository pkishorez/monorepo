import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type Ref,
} from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  History,
  Pencil,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from '@monorepo/frontend/motion';
import { cn } from '@monorepo/frontend/lib/utils';
import type { Account } from '../../contract/account/index.ts';
import { AnimatedMoney } from './animated-money.tsx';
import { formatMoney } from './money.ts';
import type { Paging } from './paging.ts';
import {
  bare,
  chWidth,
  digitsOnly,
  eyebrow,
  mono,
  parseAmount,
} from '../shared.ts';

export interface Activity {
  readonly sent: number;
  readonly received: number;
}

const NO_ACTIVITY: Activity = { sent: 0, received: 0 };

export interface LedgerProps {
  /** Newest-first page of accounts, already without the sender. */
  readonly rows: readonly Account[];
  readonly from: Account | null;
  readonly paging: Paging;
  readonly activity: ReadonlyMap<string, Activity>;
  readonly busy: ReadonlySet<string>;
  readonly fromId: string | null;
  readonly toId: string | null;
  readonly onChoose: (accountId: string) => void;
  readonly onClear: () => void;
  readonly onDropReceiver: () => void;
  readonly onSwap: () => void;
  readonly onSend: (amount: number, stay?: boolean) => void;
  readonly onHistory: (accountId: string) => void;
}

const money = cn(mono, 'text-xl');
const rowShell =
  'flex h-7 w-full items-baseline justify-between gap-6 text-left outline-none';
const scrollBox =
  '-mx-3.5 h-[30rem] min-h-[8rem] shrink overflow-x-hidden overflow-y-auto overscroll-contain px-3.5 [scrollbar-color:var(--border)_transparent] [scrollbar-width:thin]';

const numberField =
  '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';

const moveFocus = (event: KeyboardEvent<HTMLElement>) => {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
  const focusable = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>('[data-row]'),
  );
  const index = focusable.indexOf(document.activeElement as HTMLElement);
  const next =
    event.key === 'ArrowDown'
      ? Math.min(focusable.length - 1, index + 1)
      : Math.max(0, index - 1);
  focusable[next]?.focus();
  event.preventDefault();
};

const QUICK = [1, 5, 10] as const;

const coarsePointer = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(pointer: coarse)').matches;

const keepFocus = (event: { preventDefault: () => void }) =>
  event.preventDefault();

const tap = { scale: 0.92 } as const;

const badge =
  'h-8 rounded-full bg-muted px-3.5 text-sm font-medium text-foreground/80 outline-none transition-colors duration-150 focus-visible:bg-primary focus-visible:text-primary-foreground active:bg-primary active:text-primary-foreground';

const panel = '-mx-2.5 rounded-xl px-2.5';
const panelOn = 'bg-muted/15';

const fast = { duration: 0.15, ease: 'easeOut' } as const;
const lift = { duration: 0.2, ease: 'easeOut' } as const;

function Activity({
  name,
  activity,
  onHistory,
}: {
  name: string;
  activity: Activity;
  onHistory: () => void;
}) {
  const idle = activity.sent === 0 && activity.received === 0;
  return (
    <button
      type="button"
      onPointerDown={keepFocus}
      onClick={(event) => {
        event.stopPropagation();
        onHistory();
      }}
      aria-label={`${name}: ${activity.sent} sent, ${activity.received} received. See transactions`}
      className={cn(
        mono,
        'flex h-6 shrink-0 items-center gap-2 rounded-full bg-muted/70 pr-2.5 pl-2 text-xs font-medium normal-case tracking-tight outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring',
        idle && 'text-muted-foreground/50',
      )}
    >
      <History className="size-3 text-muted-foreground/60" />
      <span className="flex items-center gap-0.5 text-destructive">
        <ArrowUp className="size-3" strokeWidth={2.5} />
        {activity.sent.toLocaleString()}
      </span>
      <span aria-hidden className="h-3 w-px bg-border" />
      <span
        className={cn(
          'flex items-center gap-0.5',
          activity.received > 0 && 'text-primary',
        )}
      >
        <ArrowDown className="size-3" strokeWidth={2.5} />
        {activity.received.toLocaleString()}
      </span>
    </button>
  );
}

function Stage({
  from,
  activity,
  onClear,
  onHistory,
}: {
  from: Account | null;
  activity: Activity;
  onClear: () => void;
  onHistory: (accountId: string) => void;
}) {
  return (
    <div
      className={cn(
        panel,
        '-my-3 flex flex-col gap-1 py-3 transition-colors duration-200',
        from !== null && panelOn,
      )}
    >
      <div className={cn(eyebrow, 'flex h-5 items-center justify-between')}>
        <AnimatePresence initial={false}>
          {from !== null && (
            <motion.span
              key="send"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={fast}
            >
              From
            </motion.span>
          )}
        </AnimatePresence>
        <AnimatePresence initial={false}>
          {from !== null && (
            <motion.span
              key="history"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={fast}
              className="-mr-2 flex items-center"
            >
              <Activity
                name={from.name}
                activity={activity}
                onHistory={() => onHistory(from.id)}
              />
            </motion.span>
          )}
        </AnimatePresence>
      </div>
      <div className="relative h-10">
        <AnimatePresence initial={false}>
          {from === null ? (
            <motion.p
              key="placeholder"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={fast}
              className="absolute inset-0 flex items-center text-base text-muted-foreground/40"
            >
              Tap an account to send from
            </motion.p>
          ) : (
            <motion.div
              key={from.id}
              layout="position"
              layoutId={`row-${from.id}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={lift}
              className={cn(rowShell, 'absolute inset-0 h-10 items-center')}
            >
              <button
                type="button"
                onClick={onClear}
                aria-label={`Cancel sending from ${from.name}`}
                className="group flex min-w-0 flex-1 items-center gap-2 self-stretch truncate text-left text-base text-primary outline-none"
              >
                <span className="truncate">{from.name}</span>
                <X className="size-3.5 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-foreground group-focus-visible:text-foreground" />
              </button>
              <span className={money}>
                <AnimatedMoney amount={from.balance} />
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function Row({
  ref,
  row,
  layoutKey,
  activity,
  onHistory,
  busy,
  dimmed,
  target,
  onChoose,
}: {
  ref?: Ref<HTMLLIElement>;
  row: Account;
  layoutKey: string;
  activity: Activity;
  onHistory: () => void;
  busy: boolean;
  dimmed: boolean;
  target: {
    readonly available: number;
    readonly raw: string;
    readonly onRaw: (raw: string) => void;
    readonly onSend: (amount: number, stay?: boolean) => void;
    readonly onDropReceiver: () => void;
    readonly onSwap: () => void;
  } | null;
  onChoose: () => void;
}) {
  const amount = target === null ? null : parseAmount(target.raw);
  const over = target !== null && amount !== null && amount > target.available;
  const inputRef = useRef<HTMLInputElement>(null);
  const settled = useRef(false);
  const [editing, setEditing] = useState(false);
  const targeting = target !== null;
  useEffect(() => {
    settled.current = false;
    setEditing(false);
  }, [targeting]);
  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const choose = () => onChoose();
  const edit = () => {
    if (!targeting) return;
    setEditing(true);
    inputRef.current?.focus();
  };
  const toggleEdit = () => {
    if (editing) inputRef.current?.blur();
    else edit();
  };

  const settle = (act: () => void) => {
    if (settled.current) return;
    settled.current = true;
    act();
  };
  const commit = () => {
    if (target === null || amount === null || over) return;
    settle(() => target.onSend(amount));
  };

  return (
    <motion.li
      ref={ref}
      layout
      layoutDependency={layoutKey}
      layoutId={`row-${row.id}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: dimmed ? 0.7 : 1 }}
      exit={{ opacity: 0 }}
      transition={lift}
      role="button"
      tabIndex={0}
      data-row
      aria-pressed={targeting}
      onClick={choose}
      onPointerDown={(event) => {
        if (targeting && !(event.target as HTMLElement).closest('form'))
          event.preventDefault();
      }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          choose();
        }
      }}
      className={cn(
        panel,
        'group py-3 outline-none transition-colors duration-200',
        targeting && panelOn,
      )}
    >
      <div className="relative flex flex-col gap-2">
        <motion.div
          layout="position"
          layoutDependency={targeting}
          transition={lift}
          className={cn(rowShell, 'min-w-0 shrink-0')}
        >
          <span
            className={cn(
              'flex min-w-0 flex-1 items-center gap-2 truncate text-base transition-colors',
              targeting && 'text-primary',
              !targeting && 'group-hover:text-primary',
            )}
          >
            <span className="truncate">{row.name}</span>
            <AnimatePresence initial={false}>
              {targeting && (
                <motion.span
                  key="activity"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={fast}
                  className="flex shrink-0 items-center"
                >
                  <Activity
                    name={row.name}
                    activity={activity}
                    onHistory={onHistory}
                  />
                </motion.span>
              )}
            </AnimatePresence>
          </span>
          <span className="flex shrink-0 items-baseline gap-3">
            <motion.span
              layout="position"
              layoutDependency={editing}
              transition={fast}
              onClick={(event) => {
                if (!targeting) return;
                event.stopPropagation();
                edit();
              }}
              className={cn(
                money,
                'transition-colors',
                busy && 'text-muted-foreground/60',
                editing &&
                  'text-muted-foreground/60 line-through decoration-muted-foreground/30',
              )}
            >
              <AnimatedMoney amount={row.balance} />
            </motion.span>
            <AnimatePresence initial={false} mode="popLayout">
              {target !== null && editing && (
                <motion.form
                  key="amount"
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 8 }}
                  transition={fast}
                  onClick={(event) => event.stopPropagation()}
                  onSubmit={(event) => {
                    event.preventDefault();
                    commit();
                  }}
                  className={cn(
                    money,
                    'flex items-baseline text-primary',
                    over && 'text-destructive',
                  )}
                >
                  <span aria-hidden>+</span>
                  <input
                    ref={inputRef}
                    id={`amount-${row.id}`}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    step={1}
                    autoComplete="off"
                    value={target.raw}
                    onChange={(event) =>
                      target.onRaw(digitsOnly(event.target.value))
                    }
                    onBlur={() => {
                      if (coarsePointer()) commit();
                      setEditing(false);
                    }}
                    placeholder="0"
                    aria-label={`Amount to send to ${row.name}, up to ${formatMoney(target.available)}`}
                    style={chWidth(target.raw)}
                    className={cn(
                      bare,
                      numberField,
                      'text-right leading-none caret-primary',
                    )}
                  />
                </motion.form>
              )}
            </AnimatePresence>
          </span>
        </motion.div>
        <AnimatePresence initial={false} mode="popLayout">
          {target !== null && targeting && (
            <motion.div
              key="quick"
              layout="position"
              layoutDependency={targeting}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={fast}
              onClick={(event) => event.stopPropagation()}
              className="flex h-10 shrink-0 items-center justify-between gap-6"
            >
              <motion.button
                type="button"
                whileTap={tap}
                onPointerDown={keepFocus}
                onClick={target.onSwap}
                aria-label={`Swap: send from ${row.name} instead`}
                className={cn(
                  badge,
                  'flex size-8 items-center justify-center px-0',
                )}
              >
                <ArrowUpDown className="size-3.5" />
              </motion.button>
              <span className="flex items-center gap-2">
                {QUICK.map((quick) => (
                  <motion.button
                    key={quick}
                    type="button"
                    whileTap={tap}
                    disabled={quick > target.available}
                    onPointerDown={keepFocus}
                    onClick={() => target.onSend(quick, true)}
                    className={cn(
                      mono,
                      badge,
                      'disabled:opacity-30 disabled:active:bg-muted disabled:active:text-foreground/80',
                    )}
                  >
                    +{quick}
                  </motion.button>
                ))}
                <motion.button
                  type="button"
                  whileTap={tap}
                  onClick={toggleEdit}
                  aria-label={`Type an amount to send to ${row.name}`}
                  aria-pressed={editing}
                  className={cn(
                    badge,
                    'flex size-8 items-center justify-center px-0',
                    editing && 'bg-primary text-primary-foreground',
                  )}
                >
                  <Pencil className="size-3.5" />
                </motion.button>
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.li>
  );
}

function Pager({ paging }: { paging: Paging }) {
  const arrow =
    'flex size-8 items-center justify-center rounded-full outline-none transition-colors hover:bg-muted focus-visible:bg-muted disabled:opacity-30 disabled:hover:bg-transparent';
  return (
    <div
      className={cn(
        eyebrow,
        'flex h-8 shrink-0 items-center justify-between normal-case tracking-normal',
      )}
    >
      <span className={mono}>
        {paging.total === 0
          ? 'No accounts'
          : `${paging.first.toLocaleString()}–${paging.last.toLocaleString()} of ${paging.total.toLocaleString()}`}
      </span>
      <span className="flex items-center gap-1">
        <motion.button
          type="button"
          whileTap={tap}
          onClick={paging.onPrev}
          disabled={paging.page === 0}
          aria-label="Previous page"
          className={arrow}
        >
          <ChevronLeft className="size-4" />
        </motion.button>
        <span className={cn(mono, 'min-w-12 text-center')}>
          {paging.page + 1} / {paging.pageCount}
        </span>
        <motion.button
          type="button"
          whileTap={tap}
          onClick={paging.onNext}
          disabled={paging.page >= paging.pageCount - 1}
          aria-label="Next page"
          className={arrow}
        >
          <ChevronRight className="size-4" />
        </motion.button>
      </span>
    </div>
  );
}

export function Ledger({
  rows,
  from,
  paging,
  activity,
  busy,
  fromId,
  toId,
  onChoose,
  onClear,
  onDropReceiver,
  onSwap,
  onSend,
  onHistory,
}: LedgerProps) {
  const [raw, setRaw] = useState('');
  useEffect(() => setRaw(''), [fromId, toId]);

  const typing = from !== null && toId !== null;
  // Rows only re-measure when the sender or receiver changes, so a flood of inserts
  // on the newest-first page re-renders in place instead of sliding every row.
  const layoutKey = `${fromId ?? ''}/${toId ?? ''}`;

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') onDropReceiver();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div
      className="flex max-h-full min-h-0 flex-col gap-4"
      onKeyDown={moveFocus}
    >
      <Stage
        from={from}
        activity={
          from === null ? NO_ACTIVITY : (activity.get(from.id) ?? NO_ACTIVITY)
        }
        onClear={onClear}
        onHistory={onHistory}
      />
      <div className={scrollBox}>
        {/* Keyed by page so a page change remounts the list instead of animating every row. */}
        <ul key={paging.page} className="relative">
          <AnimatePresence initial={false} mode="popLayout">
            {rows.map((row) => (
              <Row
                key={row.id}
                row={row}
                layoutKey={layoutKey}
                activity={activity.get(row.id) ?? NO_ACTIVITY}
                onHistory={() => onHistory(row.id)}
                busy={busy.has(row.id)}
                dimmed={typing && row.id !== toId}
                target={
                  row.id === toId && from !== null
                    ? {
                        available: from.balance,
                        raw,
                        onRaw: setRaw,
                        onSend,
                        onDropReceiver,
                        onSwap,
                      }
                    : null
                }
                onChoose={() => onChoose(row.id)}
              />
            ))}
          </AnimatePresence>
        </ul>
      </div>
      <Pager paging={paging} />
    </div>
  );
}
