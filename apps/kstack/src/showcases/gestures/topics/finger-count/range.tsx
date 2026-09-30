import { ArrowUpIcon } from '@kstackz/ui-toolkit/lucide';
import { useSwipe } from '@kstackz/use-gesture/recognizers';
import { motion } from 'motion/react';
import { useState } from 'react';
import { useStageStatus } from '../../stage/index.ts';

/** One Swipe up that takes two or three fingers, and Cancels with `fingers` for one or four. */
export function Range() {
  const [commits, setCommits] = useState(0);
  const [last, setLast] = useState<string>();
  const swipe = useSwipe({
    direction: 'up',
    fingers: [2, 3],
    onCommit: () => {
      setCommits((n) => n + 1);
      setLast('Committed');
    },
    onCancel: (reason) => setLast(`Cancelled: ${reason}`),
  });
  const tracking = swipe.state === 'tracking';
  useStageStatus(tracking ? 'Tracking' : last);

  return (
    <div className="absolute inset-0 grid place-items-center">
      <div className="relative flex w-40 flex-col items-center gap-2 overflow-hidden rounded-xl bg-muted py-6 text-xs">
        {commits > 0 ? (
          <motion.div
            key={commits}
            className="absolute inset-0 bg-primary/30"
            initial={{ opacity: 1 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
        ) : null}
        <motion.div
          className="absolute inset-0 rounded-xl ring-2 ring-primary ring-inset"
          style={{ opacity: tracking ? swipe.progress : 0 }}
        />
        <ArrowUpIcon className="size-5" aria-hidden="true" />
        <span className="font-medium">2 or 3 fingers</span>
      </div>
    </div>
  );
}
