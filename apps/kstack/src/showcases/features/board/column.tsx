import { Spinner } from '@kstackz/ui-toolkit/components/ui/spinner';
import { ArrowDownIcon } from '@kstackz/ui-toolkit/lucide';
import { GestureZone, usePullToRefresh } from '@kstackz/use-gesture';
import { type MotionValue, motion, useTransform } from 'motion/react';
import { useEffect, useRef } from 'react';
import { CardItem } from './card.tsx';
import type { ColumnId, Task } from './data.ts';
import type { BoardGesture } from './gesture.ts';

/**
 * One column: its title and count over its cards, which scroll on their own
 * and pull to refresh from the top. A zone of its own, so each column pulls
 * alone.
 */
export function Column(props: {
  readonly id: ColumnId;
  readonly title: string;
  readonly tasks: ReadonlyArray<Task>;
  readonly width: number;
  readonly previous: string | undefined;
  readonly next: string | undefined;
  readonly gesture: BoardGesture;
  readonly onRefresh: () => Promise<unknown>;
}) {
  return (
    <GestureZone
      data-column={props.id}
      className="flex shrink-0 flex-col overflow-hidden rounded-xl bg-muted/60"
      style={{ width: props.width }}
    >
      <header className="flex items-baseline gap-2 px-3.5 pt-3 pb-2">
        <h2 className="text-sm font-semibold">{props.title}</h2>
        <span className="text-xs text-muted-foreground tabular-nums">
          {props.tasks.length}
        </span>
      </header>
      <Cards {...props} />
    </GestureZone>
  );
}

function Cards(props: Parameters<typeof Column>[0]) {
  const { gesture } = props;
  const pull = usePullToRefresh({
    // A pull made while carrying a card is part of the carry.
    onRefresh: () => (gesture.carrying.get() ? undefined : props.onRefresh()),
  });
  const y = useTransform(() => {
    const pulled = pull.y.get();
    return gesture.carrying.get() ? 0 : pulled;
  });
  // Cards new to this column since it first showed arrive with a fade:
  // swiped in, refreshed in, or a whole other board.
  const seen = useRef<ReadonlySet<string>>(undefined);
  useEffect(() => {
    seen.current = new Set(props.tasks.map((task) => task.id));
  });

  return (
    <div className="relative min-h-0 flex-1">
      <PullIndicator
        y={y}
        armed={pull.state === 'armed'}
        refreshing={pull.state === 'refreshing'}
      />
      <motion.div
        layoutScroll
        className="absolute inset-0 overflow-x-hidden overflow-y-auto"
      >
        <motion.ul
          className="flex flex-col gap-2 px-2 pb-[calc(env(safe-area-inset-bottom)+5.5rem)]"
          style={{ y }}
        >
          {props.tasks.map((task) => (
            <CardItem
              key={task.id}
              task={task}
              x={gesture.swipe.id === task.id ? gesture.swipe.x : undefined}
              lifted={gesture.lifted?.id === task.id}
              fresh={
                seen.current !== undefined &&
                !seen.current.has(task.id) &&
                gesture.lifted?.id !== task.id
              }
              previous={props.previous}
              next={props.next}
            />
          ))}
        </motion.ul>
      </motion.div>
    </div>
  );
}

function PullIndicator(props: {
  readonly y: MotionValue<number>;
  readonly armed: boolean;
  readonly refreshing: boolean;
}) {
  const opacity = useTransform(props.y, [8, 48], [0, 1]);
  const top = useTransform(props.y, (y) => y / 2 - 12);
  return (
    <motion.div
      aria-hidden={!props.refreshing}
      className="absolute inset-x-0 top-0 flex justify-center text-muted-foreground"
      style={{ opacity, y: top }}
    >
      {props.refreshing ? (
        <Spinner className="size-5" />
      ) : (
        <ArrowDownIcon
          className="size-5 transition-transform duration-150"
          style={{ rotate: props.armed ? '180deg' : '0deg' }}
        />
      )}
    </motion.div>
  );
}
