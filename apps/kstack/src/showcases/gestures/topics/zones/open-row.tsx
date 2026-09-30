import { ArchiveIcon, TrashIcon } from '@kstackz/ui-toolkit/lucide';
import { GestureZone } from '@kstackz/use-gesture';
import { useSwipe } from '@kstackz/use-gesture/recognizers';
import { animate, motion, useMotionValue, useTransform } from 'motion/react';
import { useState } from 'react';
import { useStageStatus } from '../../stage/index.ts';

const ACTIONS = 112;
const SPRING = { type: 'spring', stiffness: 500, damping: 45 } as const;
const ROWS = ['Invoice #1042', 'Team offsite', 'Weekly digest', 'Receipt'];

/**
 * A row that opens its actions with a Swipe left and shuts them with a Swipe
 * right. Its hooks hear the row's own zone.
 */
function RowBody(props: {
  readonly title: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const { open, onOpenChange } = props;
  const base = useMotionValue(0);
  const settle = (to: number) => {
    base.set(x.get());
    opening.offset.set(0);
    closing.offset.set(0);
    animate(base, to, SPRING);
  };
  const opening = useSwipe({
    direction: 'left',
    enabled: !open,
    onCommit: () => {
      settle(-ACTIONS);
      onOpenChange(true);
    },
    onCancel: () => settle(0),
  });
  const closing = useSwipe({
    direction: 'right',
    enabled: open,
    onCommit: () => {
      settle(0);
      onOpenChange(false);
    },
    onCancel: () => settle(-ACTIONS),
  });
  const x = useTransform(() =>
    Math.min(
      0,
      Math.max(
        -ACTIONS,
        base.get() - opening.offset.get() + closing.offset.get(),
      ),
    ),
  );

  return (
    <>
      <div
        className="absolute inset-y-0 right-0 flex"
        style={{ width: ACTIONS }}
      >
        <button
          type="button"
          aria-label="Archive"
          className="grid flex-1 place-items-center bg-muted text-foreground"
          onClick={() => {
            settle(0);
            onOpenChange(false);
          }}
        >
          <ArchiveIcon className="size-4" />
        </button>
        <button
          type="button"
          aria-label="Delete"
          className="grid flex-1 place-items-center bg-destructive text-white"
          onClick={() => {
            settle(0);
            onOpenChange(false);
          }}
        >
          <TrashIcon className="size-4" />
        </button>
      </div>
      <motion.div
        className="relative flex h-full items-center bg-card px-4 text-sm"
        style={{ x }}
      >
        {props.title}
      </motion.div>
    </>
  );
}

/**
 * A list that counts Swipes right, over rows that are each a zone. A shut
 * row wants only a Swipe left, so a Swipe right passes out to the list. An
 * open row wants the Swipe right that shuts it, so its zone takes that one
 * and the list drops it; nothing is trapped.
 */
export function OpenRow() {
  const [open, setOpen] = useState<ReadonlySet<number>>(new Set());
  const [count, setCount] = useState(0);
  const list = useSwipe({
    direction: 'right',
    onCommit: () => setCount((n) => n + 1),
  });
  useStageStatus(
    list.state === 'tracking'
      ? 'The list hears it'
      : open.size > 0
        ? `${open.size} open: its row takes a Swipe right`
        : undefined,
  );

  return (
    <div
      data-active={list.state === 'tracking' || undefined}
      className="absolute inset-0 flex flex-col ring-2 ring-transparent transition-shadow ring-inset data-active:ring-primary"
    >
      <div className="flex items-center justify-between px-4 py-3 text-xs text-muted-foreground">
        <span>Inbox</span>
        <span className="tabular-nums">List swipes: {count}</span>
      </div>
      <ul className="flex flex-col divide-y divide-border border-y border-border">
        {ROWS.map((title, i) => (
          <li key={title} className="h-12">
            <GestureZone className="relative h-full overflow-hidden">
              <RowBody
                title={title}
                open={open.has(i)}
                onOpenChange={(next) =>
                  setOpen((current) => {
                    const copy = new Set(current);
                    if (next) copy.add(i);
                    else copy.delete(i);
                    return copy;
                  })
                }
              />
            </GestureZone>
          </li>
        ))}
      </ul>
    </div>
  );
}
