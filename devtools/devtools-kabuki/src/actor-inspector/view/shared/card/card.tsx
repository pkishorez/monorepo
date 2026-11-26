import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { MailIcon, XIcon } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '@kestack/web-platform/ui/components/utils';
import {
  cardKind,
  levelsOf,
  readableKey,
  tookChanged,
} from '../../../logic/shared/index.ts';
import type {
  Card,
  Condition,
  Mode,
  Part,
  Use,
} from '../../../logic/shared/index.ts';
import type { Placed } from '../canvas/layout.ts';
import { CARD_SPRING } from '../canvas/space.ts';
import { CardContext } from './context.ts';
import type { Carded } from './context.ts';
import { FILL, Tag, plural } from './marks.tsx';
import { Sections } from './sections.tsx';

export const SMALL = { width: 220, height: 58 } as const;
export const SMALL_KEYED = { width: SMALL.width, height: 78 } as const;
export const OPEN_WIDTH = 408;

export const anchorOf = (card: {
  readonly width: number;
  readonly height: number;
}) => (card.width === OPEN_WIDTH ? 29 : card.height / 2);

export const DASH: Record<Condition, string | undefined> = {
  always: undefined,
  while: '6 5',
  each: '1.5 4',
};

export const smallOf = (card: Card) =>
  card.key === undefined ? SMALL : SMALL_KEYED;

const placeOf = (card: Card) =>
  [
    card.print.actor !== card.name ? card.print.actor : undefined,
    card.print.condition && card.print.condition !== 'always'
      ? card.print.condition
      : undefined,
    card.print.within ? `in ${card.print.within}` : undefined,
  ].filter(Boolean);

function Head({
  card,
  onClose,
}: {
  readonly card: Card;
  readonly onClose: () => void;
}) {
  const where = placeOf(card);
  return (
    <div
      onClick={(event) => {
        if (!(event.target as Element).closest('button')) onClose();
      }}
      className="flex cursor-pointer items-center gap-2 border-b border-border bg-muted/50 py-2.5 pr-2 pl-3"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <h3 className="truncate text-base leading-tight font-semibold">
          {card.name}
        </h3>
        {where.length > 0 && (
          <p className="truncate text-xs text-muted-foreground">
            {where.join(' · ')}
          </p>
        )}
        {card.key && (
          <p
            title={card.key}
            className="truncate font-mono text-[11px] text-muted-foreground/80"
          >
            #{card.key}
          </p>
        )}
      </div>
      {card.state && card.state !== 'Single' && (
        <span title={`In the State ${card.state}`} className="flex shrink-0">
          <Tag>{card.state}</Tag>
        </span>
      )}
      <button
        type="button"
        aria-label={`Close ${card.name}`}
        title="Close"
        onClick={onClose}
        className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-background/70 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <XIcon aria-hidden className="size-4" />
      </button>
    </div>
  );
}

function Small({ card }: { readonly card: Card }) {
  const levels = levelsOf(card);
  const workers = [
    levels.always,
    ...levels.states.filter((level) => level.key === card.state),
  ].flatMap((level) => level.workers);
  const where = [
    card.print.actor !== card.name ? card.print.actor : undefined,
    card.print.within ? `in ${card.print.within}` : undefined,
  ].filter(Boolean);
  return (
    <>
      <span className="flex w-full min-w-0 items-center gap-1.5">
        <span className="min-w-0 truncate text-sm font-medium">
          {card.name}
        </span>
        {card.state && card.state !== 'Single' && (
          <span className="ml-auto">
            <Tag>{card.state}</Tag>
          </span>
        )}
      </span>
      <span className="flex w-full min-w-0 items-center gap-2 text-xs text-muted-foreground">
        <span className="truncate">{where.join(' · ') || ' '}</span>
        {workers.length > 0 && (
          <span className="ml-auto flex shrink-0 items-center gap-1 text-[11px] tabular-nums">
            {plural(workers.length, 'worker')}
          </span>
        )}
      </span>
      {card.key && (
        <span
          title={card.key}
          className="flex w-full min-w-0 items-center gap-1.5 text-[11px]"
        >
          <span className="shrink-0 text-muted-foreground/70">key</span>
          <span className="min-w-0 truncate font-mono text-muted-foreground">
            {readableKey(card.key)}
          </span>
        </span>
      )}
    </>
  );
}

export function CardNode({
  placed,
  body,
  open,
  focus,
  dim = false,
  still = false,
  folding = true,
  flash,
  onOpen,
  onCenter,
  onFold,
  onChild,
  uses,
  onCapability,
  onMeasure,
}: {
  readonly placed: Placed;
  readonly body: ReactNode;
  readonly open: boolean;
  readonly focus?: Part;
  readonly dim?: boolean;
  readonly still?: boolean;
  readonly folding?: boolean;
  readonly flash?: number;
  readonly onOpen: (id: string, open: boolean) => void;
  readonly onCenter: (id: string) => void;
  readonly onFold: (id: string, open: boolean) => void;
  readonly onChild: (parent: string, slot: string) => void;
  readonly uses: ReadonlyArray<Use>;
  readonly onCapability: (
    id: string,
    name: string,
    side: 'requires' | 'provides',
  ) => void;
  readonly onMeasure: (id: string, height: number) => void;
}) {
  const { card } = placed;
  const mode: Mode = card.state === null ? 'blueprint' : 'live';
  const box = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (open && box.current) onMeasure(card.id, box.current.offsetHeight);
  });
  useEffect(() => {
    const element = box.current;
    if (!open || !element) return;
    const observer = new ResizeObserver(() =>
      flushSync(() => onMeasure(card.id, element.offsetHeight)),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [open, card.id, onMeasure]);
  const kind = cardKind(card);
  const carded = useMemo(
    (): Carded => ({
      card,
      mode,
      focus,
      uses,
      onChild: (slot) => onChild(card.id, slot),
      onCapability: (name, side) => onCapability(card.id, name, side),
    }),
    [card, mode, focus, uses, onChild, onCapability],
  );
  return (
    <motion.div
      data-node={card.id}
      initial={
        card.change === 'started' && !still
          ? { x: placed.x, y: placed.y, opacity: 0, scale: 0.96 }
          : false
      }
      animate={{ x: placed.x, y: placed.y, opacity: dim ? 0.25 : 1, scale: 1 }}
      transition={
        still
          ? { duration: 0 }
          : { ...CARD_SPRING, opacity: { duration: 0.3, ease: 'easeOut' } }
      }
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onCenter(card.id);
      }}
      className={cn('absolute top-0 left-0', (open || card.took) && 'z-20')}
    >
      {card.took && (
        <div
          className={cn(
            'pointer-events-none absolute -top-2.5 left-3 z-30 flex h-5 max-w-[calc(100%-1.5rem)] items-center gap-1.5 rounded-full border bg-card px-2 text-[11px] whitespace-nowrap shadow-sm',
            tookChanged(card)
              ? 'border-changed/50 text-changed'
              : 'border-border text-muted-foreground',
          )}
        >
          <MailIcon aria-hidden className="size-3 shrink-0" />
          <span className="truncate font-mono font-medium text-foreground">
            {card.took.message.split('/').at(-1)}
          </span>
          {!tookChanged(card) && (
            <span className="shrink-0">
              {card.took.outcome === 'handled' ? 'no change' : 'no rule'}
            </span>
          )}
        </div>
      )}
      <div
        className={cn(
          'relative overflow-hidden rounded-xl border bg-card text-card-foreground transition-[border-color] duration-300 motion-reduce:transition-none',
          open ? 'border-foreground/15 shadow-lg' : 'border-border shadow-xs',
        )}
        style={{
          width: open ? OPEN_WIDTH : SMALL.width,
          ...(open ? {} : { height: smallOf(card).height }),
        }}
      >
        {kind && (
          <span
            aria-hidden
            className={cn(
              'pointer-events-none absolute inset-y-2.5 left-0 z-10 w-[3px] rounded-r-full',
              FILL[kind],
            )}
          />
        )}
        {flash !== undefined && (
          <motion.span
            key={flash}
            aria-hidden
            initial={{ opacity: 0.9 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 1.1, ease: 'easeOut' }}
            className="pointer-events-none absolute inset-0 z-10 rounded-xl bg-running/15 ring-2 ring-running ring-inset"
          />
        )}
        <div ref={box}>
          {open ? (
            <>
              <Head card={card} onClose={() => onOpen(card.id, false)} />
              <div className="px-2 pt-2 pb-1">
                <CardContext.Provider value={carded}>
                  {body ?? <Sections />}
                </CardContext.Provider>
              </div>
            </>
          ) : (
            <button
              type="button"
              onClick={() => onOpen(card.id, true)}
              aria-expanded={false}
              aria-label={`${card.name}${card.key ? ` #${card.key}` : ''}${card.change ? ', changed at this Step' : ''}`}
              className="flex w-full min-w-0 flex-col gap-1 px-3 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            >
              <Small card={card} />
            </button>
          )}
        </div>
      </div>
      {folding && card.children.length > 0 && (
        <button
          type="button"
          aria-label={
            placed.hidden > 0
              ? `Show the ${placed.hidden} under ${card.name}`
              : `Fold what is under ${card.name}`
          }
          onClick={() => onFold(card.id, placed.hidden > 0)}
          style={{
            top: anchorOf(
              open ? { width: OPEN_WIDTH, height: 0 } : smallOf(card),
            ),
          }}
          className="absolute left-full z-10 ml-1.5 flex h-8 min-w-8 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background px-2 font-mono text-xs font-medium text-muted-foreground outline-none transition-[color,background-color,scale] duration-150 ease-out before:absolute before:-inset-2 before:content-[''] hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.94] motion-reduce:transition-none"
        >
          {placed.hidden > 0 ? `+${placed.hidden}` : '−'}
        </button>
      )}
    </motion.div>
  );
}
