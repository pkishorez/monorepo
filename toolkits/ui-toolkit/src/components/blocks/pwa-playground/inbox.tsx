import { useRef, useState } from 'react';
import { motion, useTransform } from 'motion/react';
import { Archive, ArrowDown, LoaderCircle, Trash2 } from 'lucide-react';
import { Button } from '#components/ui/button';
import { cn } from '#lib/utils';
import { GestureZone, type GestureSpring, useSwipe, useTap } from '../gestures';
import {
  type PlaygroundMessage,
  playgroundMessage,
  playgroundMessages,
} from './messages';

const PULL_PX = 72;
const ACTIONS_PX = 144;
const NEW_PER_REFRESH = 2;

const AVATAR: Record<PlaygroundMessage['hue'], string> = {
  6: 'bg-chart-6',
  7: 'bg-chart-7',
  8: 'bg-chart-8',
  9: 'bg-chart-9',
};

type Open = { readonly id: number; readonly close: () => void };

const usePullToRefresh = (
  onRefresh: () => Promise<void>,
  spring?: GestureSpring,
) => {
  const pull = useSwipe({
    direction: 'down',
    distance: PULL_PX,
    after: 'return',
    onSwipe: onRefresh,
    spring,
  });
  const { progress, armed } = pull;
  return {
    listY: useTransform(progress, (value) => value * PULL_PX),
    arrowRotate: useTransform(progress, [0, 1], [0, 180]),
    indicatorOpacity: useTransform(progress, [0, 0.4, 1], [0, 0.6, 1]),
    indicatorScale: useTransform(progress, [0, 1], [0.6, 1]),
    pullLabel: useTransform(armed, [0, 1], [1, 0]),
    releaseLabel: armed,
  };
};

const useRowSwipe = (
  row: {
    readonly onOpen: () => void;
    readonly onTap: (open: boolean) => void;
  },
  spring?: GestureSpring,
) => {
  const swipe = useSwipe({
    direction: 'left',
    distance: ACTIONS_PX,
    after: 'stay',
    onSwipe: row.onOpen,
    spring,
  });
  useTap({ onTap: () => row.onTap(swipe.progress.get() > 0.5) });
  return {
    ...swipe,
    x: useTransform(swipe.progress, (value) => -value * ACTIONS_PX),
    actionsOpacity: useTransform(swipe.progress, [0, 0.5], [0, 1]),
  };
};

function Row(props: {
  readonly message: PlaygroundMessage;
  readonly read: boolean;
  readonly fresh: boolean;
  readonly open: { current: Open | undefined };
  readonly spring?: GestureSpring;
  readonly onRead: () => void;
  readonly onRemove: () => void;
}) {
  const { message: item } = props;
  const row = useRowSwipe(
    {
      onOpen: () => {
        const last = props.open.current;
        if (last !== undefined && last.id !== item.id) last.close();
        props.open.current = { id: item.id, close: () => row.close() };
      },
      onTap: (open) => (open ? row.close() : props.onRead()),
    },
    props.spring,
  );
  return (
    <div className="relative overflow-hidden border-b border-border">
      <motion.div
        style={{ opacity: row.actionsOpacity, width: ACTIONS_PX }}
        className="absolute inset-y-0 right-0 flex"
      >
        <Button
          variant="secondary"
          className="h-full flex-1 flex-col gap-1 rounded-none text-xs"
          onClick={props.onRemove}
        >
          <Archive aria-hidden="true" />
          Archive
        </Button>
        <Button
          variant="destructive"
          className="h-full flex-1 flex-col gap-1 rounded-none text-xs"
          onClick={props.onRemove}
        >
          <Trash2 aria-hidden="true" />
          Delete
        </Button>
      </motion.div>
      <motion.div
        style={{ x: row.x }}
        className="relative flex gap-3 bg-background px-4 py-3"
      >
        <span
          aria-hidden="true"
          className={cn(
            'mt-0.5 size-9 shrink-0 rounded-full',
            AVATAR[item.hue],
          )}
        />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-baseline gap-2">
            <span
              className={cn(
                'truncate text-sm',
                props.read ? 'text-muted-foreground' : 'font-semibold',
              )}
            >
              {item.from}
            </span>
            {props.fresh ? (
              <span className="rounded-full bg-chart-8/20 px-1.5 text-[10px] font-medium">
                New
              </span>
            ) : null}
          </span>
          <span className="truncate text-sm">{item.subject}</span>
          <span className="truncate text-xs text-muted-foreground">
            {item.preview}
          </span>
        </span>
      </motion.div>
    </div>
  );
}

function RowZone(props: Parameters<typeof Row>[0]) {
  return (
    <GestureZone scroll="y" data-testid={`inbox-row-${props.message.id}`}>
      <Row {...props} />
    </GestureZone>
  );
}

function Feed(props: {
  readonly spring?: GestureSpring;
  readonly refreshDelayMs: number;
  readonly initialCount: number;
}) {
  const [messages, setMessages] = useState(() =>
    playgroundMessages(props.initialCount),
  );
  const [fresh, setFresh] = useState<ReadonlySet<number>>(new Set());
  const [read, setRead] = useState<ReadonlySet<number>>(new Set());
  const [refreshing, setRefreshing] = useState(false);
  const open = useRef<Open | undefined>(undefined);
  const next = useRef(1000);

  const pull = usePullToRefresh(async () => {
    setRefreshing(true);
    await new Promise((resolve) => setTimeout(resolve, props.refreshDelayMs));
    const arrived = Array.from({ length: NEW_PER_REFRESH }, () => {
      next.current += 1;
      return { ...playgroundMessage(next.current), id: next.current };
    });
    setMessages((list) => [...arrived, ...list]);
    setFresh(new Set(arrived.map((item) => item.id)));
    setRefreshing(false);
  }, props.spring);

  return (
    <div className="relative">
      <motion.div
        aria-live="polite"
        data-testid="inbox-indicator"
        data-refreshing={refreshing ? '' : undefined}
        style={{
          opacity: refreshing ? 1 : pull.indicatorOpacity,
          scale: refreshing ? 1 : pull.indicatorScale,
          height: PULL_PX,
        }}
        className="absolute inset-x-0 top-0 flex flex-col items-center justify-center gap-1 text-xs text-muted-foreground"
      >
        {refreshing ? (
          <>
            <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />
            <span>Refreshing…</span>
          </>
        ) : (
          <>
            <motion.span style={{ rotate: pull.arrowRotate }}>
              <ArrowDown aria-hidden="true" className="size-5" />
            </motion.span>
            <span className="grid">
              <motion.span
                style={{ opacity: pull.pullLabel }}
                className="col-start-1 row-start-1"
              >
                Pull to refresh
              </motion.span>
              <motion.span
                data-testid="inbox-release"
                style={{ opacity: pull.releaseLabel }}
                className="col-start-1 row-start-1 font-medium text-foreground"
              >
                Release to refresh
              </motion.span>
            </span>
          </>
        )}
      </motion.div>
      <motion.ul
        data-testid="inbox-list"
        data-count={messages.length}
        style={{ y: pull.listY }}
        className="relative bg-background"
      >
        {messages.map((item) => (
          <li key={item.id}>
            <RowZone
              message={item}
              read={read.has(item.id)}
              fresh={fresh.has(item.id)}
              open={open}
              spring={props.spring}
              onRead={() =>
                setRead((ids) => {
                  const nextIds = new Set(ids);
                  if (nextIds.has(item.id)) nextIds.delete(item.id);
                  else nextIds.add(item.id);
                  return nextIds;
                })
              }
              onRemove={() =>
                setMessages((list) =>
                  list.filter((entry) => entry.id !== item.id),
                )
              }
            />
          </li>
        ))}
      </motion.ul>
    </div>
  );
}

/** The real PWA playground inbox, with an injectable settle spring for tuning. */
export function PwaPlaygroundInbox(props: {
  readonly spring?: GestureSpring;
  readonly refreshDelayMs?: number;
  readonly initialCount?: number;
}) {
  return (
    <GestureZone
      scroll="y"
      data-testid="inbox-zone"
      className="h-full overflow-y-auto pb-[env(safe-area-inset-bottom)]"
    >
      <Feed
        spring={props.spring}
        refreshDelayMs={props.refreshDelayMs ?? 1200}
        initialCount={props.initialCount ?? 24}
      />
    </GestureZone>
  );
}
