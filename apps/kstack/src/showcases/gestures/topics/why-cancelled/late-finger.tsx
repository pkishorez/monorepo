import { useSwipe } from '@kstackz/use-gesture/recognizers';
import { motion } from 'motion/react';
import { useState } from 'react';
import { useStageStatus } from '../../stage/index.ts';

/**
 * A one-finger Swipe right. A second finger landing after it locks Cancels
 * it with `fingers`, however far it went.
 */
export function LateFinger() {
  const [last, setLast] = useState<{
    readonly id: number;
    readonly text: string;
  }>();
  const show = (text: string) =>
    setLast((was) => ({ id: (was?.id ?? 0) + 1, text }));
  const swipe = useSwipe({
    direction: 'right',
    onCommit: () => show('committed'),
    onCancel: (reason) => show(reason),
  });
  const tracking = swipe.state === 'tracking';
  useStageStatus(
    tracking
      ? 'Tracking right · land a finger'
      : last &&
          (last.text === 'committed' ? 'Committed' : `Cancelled: ${last.text}`),
  );

  return (
    <div className="absolute inset-0 grid place-items-center">
      <div className="relative grid h-32 w-56 place-items-center overflow-hidden rounded-2xl bg-muted">
        <motion.div
          className="absolute inset-0 rounded-2xl ring-2 ring-primary ring-inset"
          style={{ opacity: tracking ? swipe.progress : 0 }}
        />
        {last ? (
          <motion.span
            key={last.id}
            className="text-3xl font-semibold tracking-tight"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            {last.text}
          </motion.span>
        ) : null}
      </div>
    </div>
  );
}
