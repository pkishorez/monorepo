import { useSwipe } from '@kstackz/use-gesture/recognizers';
import { motion } from 'motion/react';
import { useState } from 'react';
import { useStageStatus } from '../../stage/index.ts';

/**
 * A Swipe down over a pad with a list in it. On the list, a touch it can
 * still scroll with is the list's: the Swipe Cancels with `interrupted`.
 */
export function Scroller() {
  const [last, setLast] = useState<{
    readonly id: number;
    readonly text: string;
  }>();
  const show = (text: string) =>
    setLast((was) => ({ id: (was?.id ?? 0) + 1, text }));
  const swipe = useSwipe({
    direction: 'down',
    onCommit: () => show('committed'),
    onCancel: (reason) => show(reason),
  });
  useStageStatus(
    swipe.state === 'tracking'
      ? 'Tracking down'
      : last &&
          (last.text === 'committed' ? 'Committed' : `Cancelled: ${last.text}`),
  );

  return (
    <div className="absolute inset-0 grid grid-cols-2">
      <div className="grid place-items-center">
        {last ? (
          <motion.span
            key={last.id}
            className="text-2xl font-semibold tracking-tight"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            {last.text}
          </motion.span>
        ) : null}
      </div>
      <ul className="flex flex-col divide-y divide-border overflow-y-auto border-l border-border bg-muted/50">
        {Array.from({ length: 30 }, (_, i) => (
          <li key={i} className="px-4 py-3 text-sm">
            Row {i + 1}
          </li>
        ))}
      </ul>
    </div>
  );
}
