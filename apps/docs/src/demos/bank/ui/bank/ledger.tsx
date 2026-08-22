import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { History, Pencil, X } from 'lucide-react';
import { AnimatePresence, motion } from '@monorepo/frontend/motion';
import { cn } from '@monorepo/frontend/lib/utils';
import type { Account } from '../../contract/account/index.ts';
import { AnimatedMoney } from './animated-money.tsx';
import { formatMoney } from './money.ts';
import { bare, chWidth, digitsOnly, mono, parseAmount } from './shared.ts';

export interface LedgerProps {
  readonly rows: readonly Account[];
  readonly busy: ReadonlySet<string>;
  readonly fromId: string | null;
  readonly toId: string | null;
  readonly onPick: (accountId: string) => void;
  readonly onCancel: () => void;
  readonly onUntarget: () => void;
  readonly onSend: (amount: number, stay?: boolean) => void;
  readonly onHistory: (accountId: string) => void;
}

const money = cn(mono, 'text-xl');
const rowShell =
  'flex h-7 w-full items-baseline justify-between gap-6 text-left outline-none';
const scrollBox =
  '-mx-3.5 h-[clamp(8rem,calc(100svh-22rem),30rem)] overflow-x-hidden overflow-y-auto overscroll-contain px-3.5 [scrollbar-color:var(--border)_transparent] [scrollbar-width:thin]';

const numberField =
  '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';
const eyebrow =
  'text-[0.6875rem] leading-none tracking-widest text-muted-foreground uppercase';

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

const tap = { scale: 0.97 } as const;

const badge =
  'h-8 rounded-full bg-muted px-3.5 text-sm font-medium text-foreground/80 outline-none transition-colors duration-150 hover:bg-primary hover:text-primary-foreground focus-visible:bg-primary focus-visible:text-primary-foreground active:bg-primary active:text-primary-foreground';

const panel = '-mx-2.5 rounded-xl px-2.5';
const panelOn = 'bg-muted/15';

const fast = { duration: 0.15, ease: 'easeOut' } as const;
const lift = { duration: 0.2, ease: 'easeOut' } as const;

function Stage({
  from,
  onCancel,
  onHistory,
}: {
  from: Account | null;
  onCancel: () => void;
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
              Send from
            </motion.span>
          )}
        </AnimatePresence>
        <AnimatePresence initial={false}>
          {from !== null && (
            <motion.button
              key="history"
              type="button"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={fast}
              onClick={() => onHistory(from.id)}
              className="-mr-2 flex h-5 items-center gap-1 rounded-full px-2 text-muted-foreground/60 outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:text-foreground"
            >
              <History className="size-3" />
              Transactions
            </motion.button>
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
              Send from
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
                onClick={onCancel}
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
  row,
  busy,
  dimmed,
  target,
  onPick,
}: {
  row: Account;
  busy: boolean;
  dimmed: boolean;
  target: {
    readonly available: number;
    readonly raw: string;
    readonly onRaw: (raw: string) => void;
    readonly onSend: (amount: number, stay?: boolean) => void;
    readonly onUntarget: () => void;
  } | null;
  onPick: () => void;
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

  const pick = () => onPick();
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
      layout
      layoutId={`row-${row.id}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={lift}
      role="button"
      tabIndex={0}
      data-row
      aria-pressed={targeting}
      onClick={pick}
      onPointerDown={(event) => {
        if (targeting && !(event.target as HTMLElement).closest('form'))
          event.preventDefault();
      }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          pick();
        }
      }}
      className={cn(
        panel,
        'group py-3 outline-none transition-[opacity,background-color] duration-200 will-change-transform',
        dimmed && 'opacity-70',
        targeting && panelOn,
      )}
    >
      <div className="relative flex flex-col gap-2">
        <motion.div
          layout="position"
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
          </span>
          <span className="flex shrink-0 items-baseline gap-3">
            <motion.span
              layout="position"
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
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={fast}
              onClick={(event) => event.stopPropagation()}
              className="flex h-10 shrink-0 items-center justify-end gap-6"
            >
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
                      'disabled:opacity-30 disabled:hover:bg-muted disabled:hover:text-foreground/80 disabled:active:bg-muted disabled:active:text-foreground/80',
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

export function Ledger({
  rows,
  busy,
  fromId,
  toId,
  onPick,
  onCancel,
  onUntarget,
  onSend,
  onHistory,
}: LedgerProps) {
  const [raw, setRaw] = useState('');
  useEffect(() => setRaw(''), [fromId, toId]);

  const from = rows.find((row) => row.id === fromId) ?? null;
  const typing = from !== null && toId !== null;

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') onUntarget();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="flex flex-col gap-4" onKeyDown={moveFocus}>
      <Stage from={from} onCancel={onCancel} onHistory={onHistory} />
      <div className={scrollBox}>
        <ul>
          <AnimatePresence initial={false}>
            {rows
              .filter((row) => row.id !== fromId)
              .map((row) => (
                <Row
                  key={row.id}
                  row={row}
                  busy={busy.has(row.id)}
                  dimmed={typing && row.id !== toId}
                  target={
                    row.id === toId && from !== null
                      ? {
                          available: from.balance,
                          raw,
                          onRaw: setRaw,
                          onSend,
                          onUntarget,
                        }
                      : null
                  }
                  onPick={() => onPick(row.id)}
                />
              ))}
          </AnimatePresence>
        </ul>
      </div>
    </div>
  );
}
