import { AnimatePresence, motion } from 'motion/react';
import type { MouseEvent, ReactNode } from 'react';
import type { WorkerStatus } from 'effect-oak';
import { shortId } from '../step/index.ts';
import type { Life } from '../step/index.ts';
import { CARD, CIRCLE, pillLabel } from './map/index.ts';
import type {
  ActorNode,
  Badge as BadgeOf,
  Card,
  ManyNode,
  StateNode,
  Status,
  WorkerUnit,
} from './map/index.ts';

/*
 * The nodes of the map, each placed by its centre and animated there: an
 * Actor's circle, a keyed Child's stack, and a State's pill. Each looks dim
 * until running, then green where the Step started it, red where it stopped
 * it, plain otherwise. An owner of Workers wears a badge counting the keys
 * expected; opened, the same circle or pill grows into a card, its name in
 * the header and one row per Worker below, with one pill per key. Live, a
 * pill also shows what the key is doing: a pulse while running, finished or
 * failed where the Effect ended on its own.
 */

const EASE_OUT = [0.23, 1, 0.32, 1] as const;
const MOVE = { duration: 0.35, ease: EASE_OUT } as const;

const enter = { opacity: 0, scale: 0.6 };
const leave = { opacity: 0, scale: 0.6, transition: { duration: 0.15 } };

/** A card's contents fade in once the shape has mostly grown, and out at once when it shrinks. */
const fade = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.2, delay: 0.12 } },
  exit: { opacity: 0, transition: { duration: 0.1 } },
} as const;

/** How a node looks for each Status: dim until running, then green, red or plain. */
const RING: Record<Status, string> = {
  dim: 'border-dashed border-muted-foreground/30 text-muted-foreground/50',
  same: 'border-muted-foreground/60 text-foreground',
  changed: 'border-primary text-foreground',
  started: 'border-positive text-positive',
  stopped: 'border-destructive/70 text-destructive',
};

const LABEL: Record<Status, string> = {
  dim: 'text-muted-foreground/50',
  same: 'text-foreground',
  changed: 'text-foreground',
  started: 'text-foreground',
  stopped: 'text-destructive line-through',
};

const Chip = ({
  message,
  stepKey,
}: {
  readonly message: string | undefined;
  readonly stepKey: number | 'init';
}) => (
  <AnimatePresence>
    {message && (
      <motion.span
        key={stepKey}
        initial={{ opacity: 0, scale: 0.5, y: 4 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, transition: { duration: 0.1 } }}
        transition={{ type: 'spring', duration: 0.4, bounce: 0.35 }}
        className="absolute bottom-full left-1/2 mb-1.5 -translate-x-1/2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-medium whitespace-nowrap text-primary-foreground shadow-sm"
      >
        {message}
      </motion.span>
    )}
  </AnimatePresence>
);

/** How a badge is tinted: lit like a node, muted with nothing expected. */
const BADGE: Record<Status, string> = {
  dim: 'border-muted-foreground/30 text-muted-foreground/60',
  same: 'border-muted-foreground/60 text-foreground',
  changed: 'border-muted-foreground/60 text-foreground',
  started: 'border-positive bg-positive/10 text-positive',
  stopped: 'border-destructive/70 bg-destructive/10 text-destructive',
};

/** The count of keys an owner's Workers expect, in the stack's ×N language: on the node's corner, or in its card's header. */
const Badge = ({
  badge,
  corner = true,
}: {
  readonly badge: BadgeOf;
  readonly corner?: boolean;
}) => (
  <span
    aria-hidden
    title={`${badge.count} Worker ${badge.count === 1 ? 'key' : 'keys'} expected; click to ${badge.open ? 'close' : 'open'}`}
    className={`flex h-4 min-w-4 items-center justify-center rounded-full border bg-background px-1 font-sans text-[9px] font-semibold tabular-nums no-underline transition-colors duration-300 ${BADGE[badge.status]} ${badge.open ? 'ring-1 ring-ring' : ''} ${corner ? 'absolute -top-1.5 -right-1.5' : 'ml-auto'}`}
  >
    {badge.count}
  </span>
);

/** Where a node's shape sits: its centre at the node's x and y, and the size it grows to. */
const shapeOf = (card: Card | undefined, width: number, height: number) => ({
  width: card ? card.width : width,
  height: card ? card.height : height,
  borderRadius: card ? CARD.radius : height / 2,
});

const SHAPE =
  'absolute top-0 left-0 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center border-2 bg-background transition-colors duration-300';

export const Circle = ({
  node,
  stepKey,
  message,
  picked,
  live,
  onPick,
  onToggle,
}: {
  readonly node: ActorNode;
  readonly stepKey: number | 'init';
  readonly message: string | undefined;
  readonly picked: boolean;
  /** What its Instance's Workers are doing now; `undefined` while not live or closed. */
  readonly live: ReadonlyArray<WorkerStatus> | undefined;
  readonly onPick: () => void;
  /** Open or close its Workers, when it owns any. */
  readonly onToggle: () => void;
}) => {
  const { instance, status, workers, card } = node;
  const running = status !== 'dim';
  return (
    <motion.button
      type="button"
      onClick={() => {
        if (running) onPick();
        if (workers) onToggle();
      }}
      disabled={!running && !workers}
      aria-pressed={picked}
      aria-expanded={workers ? workers.open : undefined}
      aria-label={
        instance
          ? `${node.actor}, ${instance.state._tag}`
          : `${node.actor}, not running`
      }
      initial={{ ...enter, x: node.x, y: node.y }}
      animate={{ opacity: 1, scale: 1, x: node.x, y: node.y }}
      exit={leave}
      transition={MOVE}
      className="group absolute top-0 left-0 size-0 outline-none disabled:cursor-default"
    >
      <motion.span
        initial={false}
        animate={shapeOf(card, CIRCLE, CIRCLE)}
        transition={MOVE}
        className={`${SHAPE} text-xs font-semibold group-focus-visible:ring-2 group-focus-visible:ring-ring ${RING[status]} ${picked ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''}`}
      >
        {status === 'changed' && (
          <motion.span
            key={stepKey}
            className="absolute inset-0 rounded-[inherit] border-2 border-primary"
            initial={{ scale: 1, opacity: 0.8 }}
            animate={{ scale: 1.7, opacity: 0 }}
            transition={{ duration: 0.7, ease: EASE_OUT }}
          />
        )}
        <AnimatePresence initial={false}>
          {card ? (
            <Open key="card" card={card} live={live}>
              <span
                className={`flex shrink-0 items-center justify-center rounded-full border text-[9px] font-semibold ${RING[status]}`}
                style={{ width: CARD.mark, height: CARD.mark }}
              >
                {initials(node.actor)}
              </span>
              <span className={`truncate text-xs font-medium ${LABEL[status]}`}>
                {node.actor}
              </span>
              {instance?.key !== undefined && (
                <span className="font-mono text-[10px] whitespace-nowrap text-muted-foreground">
                  {shortId(instance.key)}
                </span>
              )}
              {workers && <Badge badge={workers} corner={false} />}
            </Open>
          ) : (
            <motion.span key="mark" {...fade}>
              {initials(node.actor)}
            </motion.span>
          )}
        </AnimatePresence>
        <Chip message={message} stepKey={stepKey} />
        {workers && !card && <Badge badge={workers} />}
      </motion.span>
      <AnimatePresence initial={false}>
        {!card && (
          <motion.span
            key="label"
            {...fade}
            className="absolute left-0 flex -translate-x-1/2 flex-col items-center leading-tight"
            style={{ top: CIRCLE / 2 + 6 }}
          >
            <span
              className={`text-xs font-medium whitespace-nowrap transition-colors duration-300 ${LABEL[status]}`}
            >
              {node.actor}
            </span>
            {instance?.key !== undefined && (
              <span className="font-mono text-[10px] whitespace-nowrap text-muted-foreground">
                {shortId(instance.key)}
              </span>
            )}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
};

/** A keyed Child: a stack with how many Instances it has, opened to show each. */
export const Many = ({
  node,
  stepKey,
  message,
  onToggle,
}: {
  readonly node: ManyNode;
  readonly stepKey: number | 'init';
  readonly message: string | undefined;
  readonly onToggle: () => void;
}) => (
  <motion.button
    type="button"
    onClick={onToggle}
    aria-expanded={node.open}
    aria-label={`${node.actor}, ${node.count} running`}
    initial={{ ...enter, x: node.x - node.width / 2, y: node.y - CIRCLE / 2 }}
    animate={{
      opacity: 1,
      scale: 1,
      x: node.x - node.width / 2,
      y: node.y - CIRCLE / 2,
    }}
    exit={leave}
    transition={MOVE}
    className="group absolute top-0 left-0 flex flex-col items-center gap-1.5 outline-none"
    style={{ width: node.width }}
  >
    <span className="relative" style={{ width: CIRCLE + 8, height: CIRCLE }}>
      <span
        className={`absolute inset-y-0 left-2 rounded-full border-2 bg-background ${RING[node.status]} opacity-50`}
        style={{ width: CIRCLE }}
      />
      <span
        className={`absolute inset-y-0 left-0 flex items-center justify-center rounded-full border-2 bg-background text-xs font-semibold tabular-nums transition-colors duration-300 group-hover:bg-muted group-focus-visible:ring-2 group-focus-visible:ring-ring ${RING[node.status]}`}
        style={{ width: CIRCLE }}
      >
        ×{node.count}
        <Chip message={message} stepKey={stepKey} />
      </span>
    </span>
    <span
      className={`flex items-center gap-1 text-xs font-medium whitespace-nowrap ${LABEL[node.status]}`}
    >
      {node.actor}
      <span
        className={`inline-block text-muted-foreground transition-transform duration-150 ${node.open ? 'rotate-90' : ''}`}
        aria-hidden
      >
        ›
      </span>
    </span>
  </motion.button>
);

const PILL: Record<Status, string> = {
  dim: 'border-dashed border-muted-foreground/25 text-muted-foreground/50',
  same: 'border-border bg-muted text-foreground',
  changed: 'border-border bg-muted text-foreground',
  started: 'border-positive/50 bg-positive/10 text-positive',
  stopped:
    'border-destructive/40 bg-destructive/10 text-destructive line-through',
};

const PILL_HEIGHT = 24;

/** A State: a pill, and a button opening its Workers when it owns any; open, the pill grows into their card. */
export const Pill = ({
  node,
  live,
  onToggle,
}: {
  readonly node: StateNode;
  /** What its Instance's Workers are doing now; `undefined` while not live or closed. */
  readonly live: ReadonlyArray<WorkerStatus> | undefined;
  readonly onToggle: () => void;
}) => {
  const { card } = node;
  const placed = {
    initial: { ...enter, x: node.x, y: node.y },
    animate: { opacity: 1, scale: 1, x: node.x, y: node.y },
    exit: leave,
    transition: MOVE,
    className: 'group absolute top-0 left-0 size-0 outline-none',
  } as const;
  const shape = (
    <motion.span
      initial={false}
      animate={shapeOf(card, node.width, PILL_HEIGHT)}
      transition={MOVE}
      className={`${SHAPE} border font-mono text-[11px] whitespace-nowrap group-focus-visible:ring-2 group-focus-visible:ring-ring ${card ? 'bg-background' : ''} ${PILL[node.status]} ${card ? '' : 'group-hover:bg-muted'}`}
    >
      <AnimatePresence initial={false}>
        {card ? (
          <Open key="card" card={card} live={live}>
            <span className="truncate font-mono text-[11px]">{node.tag}</span>
            {node.workers && <Badge badge={node.workers} corner={false} />}
          </Open>
        ) : (
          <motion.span key="tag" {...fade}>
            {node.tag}
          </motion.span>
        )}
      </AnimatePresence>
      {node.workers && !card && <Badge badge={node.workers} />}
    </motion.span>
  );
  return node.workers ? (
    <motion.button
      type="button"
      onClick={onToggle}
      aria-expanded={node.workers.open}
      aria-label={`${node.tag}, ${node.workers.count} Worker keys`}
      {...placed}
    >
      {shape}
    </motion.button>
  ) : (
    <motion.span {...placed}>{shape}</motion.span>
  );
};

/** How a key's pill looks for what the Step did to it. */
const KEY: Record<Life, string> = {
  started: 'border-positive/50 bg-positive/10 text-positive',
  stopped:
    'border-destructive/40 bg-destructive/10 text-destructive line-through',
  kept: 'border-border bg-muted text-foreground',
};

const KEY_TITLE: Record<Life, string> = {
  started: 'Started: its Condition holds from this Step on',
  stopped: 'Stopped: its Condition no longer holds',
  kept: 'Running: its Condition held before and still does',
};

const KIND: Record<WorkerUnit['kind'], string> = {
  instance: 'runs as long as the Instance does',
  state: 'runs while in this State',
  while: 'runs while its Condition holds',
  each: 'one per key its Condition names',
};

/** What a key is doing live, when it is not simply running. */
const LIVE: Record<
  Exclude<WorkerStatus['status'], 'running'>,
  { readonly tone: string; readonly means: string }
> = {
  finished: {
    tone: 'bg-muted-foreground text-background',
    means:
      'Finished on its own, but its key is still there: nothing is running for it',
  },
  failed: {
    tone: 'bg-destructive text-destructive-foreground',
    means: 'Failed with a defect; it stays dead while its key stays',
  },
};

/** One key of a Worker: its pill, lit by the Step, with what it is doing live laid over. */
const Key = ({
  worker,
  name,
  life,
  live,
}: {
  readonly worker: WorkerUnit;
  readonly name: string;
  readonly life: Life;
  readonly live: WorkerStatus['status'] | undefined;
}) => (
  <span
    title={`${KEY_TITLE[life]}${live && live !== 'running' ? `. ${LIVE[live].means}` : ''}`}
    className={`relative flex h-4 items-center gap-1 rounded-md border px-1.5 font-mono text-[10px] whitespace-nowrap no-underline ${KEY[life]}`}
  >
    {live === 'running' && (
      <span className="relative flex size-1.5" aria-label="running">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-positive opacity-75" />
        <span className="relative inline-flex size-1.5 rounded-full bg-positive" />
      </span>
    )}
    {name}
    <AnimatePresence>
      {live && live !== 'running' && (
        <motion.span
          key={live}
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.1 } }}
          transition={{ type: 'spring', duration: 0.4, bounce: 0.35 }}
          className={`absolute -top-1.5 -right-1.5 rounded-full px-1 py-px font-sans text-[8px] leading-tight font-medium no-underline shadow-sm ${LIVE[live].tone}`}
        >
          {live}
        </motion.span>
      )}
    </AnimatePresence>
    {worker.kind === 'each' && <span className="sr-only">{worker.name}</span>}
  </span>
);

/** Only the header of a card closes it: a click on its rows reaches nothing. */
const keep = (event: MouseEvent) => event.stopPropagation();

/**
 * What an open node holds: a header row given by the owner, then one row
 * per Worker, its name, its kind and its keys as pills, each lit by the
 * Step and, live, showing what it is doing. Fades in over the grown shape,
 * as wide as it and wrapping within it; the layout sized the shape for the
 * rows, so what hangs below was already moved down, and a row the estimate
 * missed runs past the bottom edge rather than being cut off.
 */
const Open = ({
  card,
  live,
  children,
}: {
  readonly card: Card;
  readonly live: ReadonlyArray<WorkerStatus> | undefined;
  readonly children: ReactNode;
}) => (
  <motion.span
    {...fade}
    className="absolute inset-x-0 top-0 flex flex-col text-left font-normal whitespace-normal"
    style={{ padding: CARD.pad, gap: 4 }}
  >
    <span
      className="flex shrink-0 items-center gap-1.5"
      style={{ height: CARD.head }}
    >
      {children}
    </span>
    <span className="flex cursor-default flex-col" onClick={keep}>
      {card.workers.map((worker) => (
        <span
          key={worker.id}
          title={`Worker ${worker.name}: ${KIND[worker.kind]}`}
          className="flex flex-wrap items-center gap-x-1 gap-y-1"
          style={{ minHeight: CARD.line }}
        >
          <span className="font-mono text-[10px] text-foreground no-underline">
            {worker.name}
          </span>
          <span className="mr-1 text-[9px] text-muted-foreground no-underline">
            {worker.kind}
          </span>
          {worker.keys.length === 0 ? (
            <span className="text-[10px] text-muted-foreground/60 italic">
              nothing
            </span>
          ) : (
            worker.keys.map(({ key, life }) => (
              <Key
                key={key}
                worker={worker}
                name={pillLabel(worker, key)}
                life={life}
                live={
                  live?.find(
                    (status) =>
                      status.name === worker.name && status.key === key,
                  )?.status
                }
              />
            ))
          )}
        </span>
      ))}
    </span>
  </motion.span>
);

/** Up to two capitals of an Actor's name: LoggedInPages → LI. */
const initials = (name: string) =>
  (name.match(/[A-Z]/g)?.slice(0, 2).join('') ?? name.slice(0, 2)) ||
  name.slice(0, 2).toUpperCase();
