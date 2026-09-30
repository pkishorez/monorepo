import {
  ArchiveIcon,
  type LucideIcon,
  ReplyIcon,
  Trash2Icon,
} from '@kstackz/ui-toolkit/lucide';
import { useSwipe } from '@kstackz/use-gesture/recognizers';
import { motion } from 'motion/react';
import { useState } from 'react';
import { useStageStatus } from '../../stage/index.ts';

/** One action: its ring fills as its Swipe tracks, and it flashes on each Commit. */
function Action(props: {
  readonly swipe: ReturnType<typeof useSwipe>;
  readonly Icon: LucideIcon;
  readonly label: string;
  readonly fingers: number;
  readonly count: number;
}) {
  const tracking = props.swipe.state === 'tracking';
  return (
    <div className="relative flex w-24 flex-col items-center gap-2 overflow-hidden rounded-xl bg-muted py-4 text-xs">
      {props.count > 0 ? (
        <motion.div
          key={props.count}
          className="absolute inset-0 bg-primary/30"
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      ) : null}
      <motion.div
        className="absolute inset-0 rounded-xl ring-2 ring-primary ring-inset"
        style={{ opacity: tracking ? props.swipe.progress : 0 }}
      />
      <props.Icon className="size-5" aria-hidden="true" />
      <span className="font-medium">{props.label}</span>
      <span className="text-muted-foreground">
        {props.fingers} finger{props.fingers > 1 ? 's' : ''}
      </span>
    </div>
  );
}

/**
 * Three Swipes left that differ only in finger count. Each Cancels with
 * `fingers` unless exactly its count is down as the axis locks.
 */
export function ThreeSwipes() {
  const [counts, setCounts] = useState([0, 0, 0]);
  const [last, setLast] = useState<string>();
  const options = (index: number, label: string) => ({
    direction: 'left' as const,
    fingers: index + 1,
    onCommit: () => {
      setCounts((all) => all.map((n, i) => (i === index ? n + 1 : n)));
      setLast(`Committed · ${label}`);
    },
  });
  const one = useSwipe(options(0, 'Reply'));
  const two = useSwipe(options(1, 'Archive'));
  const three = useSwipe(options(2, 'Delete'));
  const tracking = [one, two, three].findIndex((s) => s.state === 'tracking');
  useStageStatus(
    tracking >= 0
      ? `Tracking · ${tracking + 1} finger${tracking ? 's' : ''}`
      : last,
  );

  return (
    <div className="absolute inset-0 flex items-center justify-center gap-3">
      <Action
        swipe={one}
        Icon={ReplyIcon}
        label="Reply"
        fingers={1}
        count={counts[0] ?? 0}
      />
      <Action
        swipe={two}
        Icon={ArchiveIcon}
        label="Archive"
        fingers={2}
        count={counts[1] ?? 0}
      />
      <Action
        swipe={three}
        Icon={Trash2Icon}
        label="Delete"
        fingers={3}
        count={counts[2] ?? 0}
      />
    </div>
  );
}
