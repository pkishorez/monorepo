import { AnimatePresence, motion } from 'motion/react';
import { shortId } from '../step/index.ts';
import { CIRCLE } from './map/index.ts';
import type { ActorNode, ManyNode, StateNode, Status } from './map/index.ts';

/*
 * The nodes of the map, each placed by its centre and animated there: an
 * Actor's circle, a keyed Child's stack and a State's pill. Each looks dim until running, then green where
 * the Step started it, red where it stopped it, plain otherwise.
 */

const EASE_OUT = [0.23, 1, 0.32, 1] as const;
const MOVE = { duration: 0.35, ease: EASE_OUT } as const;

const enter = { opacity: 0, scale: 0.6 };
const leave = { opacity: 0, scale: 0.6, transition: { duration: 0.15 } };

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

export const Circle = ({
  node,
  stepKey,
  message,
  picked,
  onPick,
}: {
  readonly node: ActorNode;
  readonly stepKey: number | 'init';
  readonly message: string | undefined;
  readonly picked: boolean;
  readonly onPick: () => void;
}) => {
  const { instance, status } = node;
  const running = status !== 'dim';
  return (
    <motion.button
      type="button"
      onClick={onPick}
      disabled={!running}
      aria-pressed={picked}
      aria-label={
        instance
          ? `${node.actor}, ${instance.state._tag}`
          : `${node.actor}, not running`
      }
      initial={{ ...enter, x: node.x - node.width / 2, y: node.y - CIRCLE / 2 }}
      animate={{
        opacity: 1,
        scale: 1,
        x: node.x - node.width / 2,
        y: node.y - CIRCLE / 2,
      }}
      exit={leave}
      transition={MOVE}
      className="group absolute top-0 left-0 flex flex-col items-center gap-1.5 outline-none disabled:cursor-default"
      style={{ width: node.width }}
    >
      <span
        className={`relative flex items-center justify-center rounded-full border-2 bg-background text-xs font-semibold transition-colors duration-300 group-focus-visible:ring-2 group-focus-visible:ring-ring ${RING[status]} ${picked ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''}`}
        style={{ width: CIRCLE, height: CIRCLE }}
      >
        {status === 'changed' && (
          <motion.span
            key={stepKey}
            className="absolute inset-0 rounded-full border-2 border-primary"
            initial={{ scale: 1, opacity: 0.8 }}
            animate={{ scale: 1.7, opacity: 0 }}
            transition={{ duration: 0.7, ease: EASE_OUT }}
          />
        )}
        {initials(node.actor)}
        <Chip message={message} stepKey={stepKey} />
      </span>
      <span className="flex flex-col items-center leading-tight">
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
      </span>
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

export const Pill = ({ node }: { readonly node: StateNode }) => (
  <motion.span
    initial={{ ...enter, x: node.x - node.width / 2, y: node.y - 12 }}
    animate={{
      opacity: 1,
      scale: 1,
      x: node.x - node.width / 2,
      y: node.y - 12,
    }}
    exit={leave}
    transition={MOVE}
    className={`absolute top-0 left-0 flex h-6 items-center justify-center rounded-full border bg-background font-mono text-[11px] whitespace-nowrap transition-colors duration-300 ${PILL[node.status]}`}
    style={{ width: node.width }}
  >
    {node.tag}
  </motion.span>
);

/** Up to two capitals of an Actor's name: LoggedInPages → LI. */
const initials = (name: string) =>
  (name.match(/[A-Z]/g)?.slice(0, 2).join('') ?? name.slice(0, 2)) ||
  name.slice(0, 2).toUpperCase();
