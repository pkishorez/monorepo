import { ArrowRightIcon } from '@kstackz/ui-toolkit/lucide';
import { useSwipe } from '@kstackz/use-gesture/recognizers';
import { animate, motion, useTransform } from 'motion/react';
import { useState } from 'react';
import { useStageStatus } from '../../stage/index.ts';

const SPRING = { type: 'spring', stiffness: 500, damping: 45 } as const;

/**
 * A Swipe right on a card that is a trapped zone: the card hears it, and the
 * Showcase's sidebar around it never does, even from the screen edge.
 */
export function ShowcaseSidebar() {
  const [heard, setHeard] = useState(false);
  const swipe = useSwipe({
    direction: 'right',
    onStart: () => setHeard(false),
    onCommit: () => {
      setHeard(true);
      animate(swipe.offset, 0, SPRING);
    },
    onCancel: () => animate(swipe.offset, 0, SPRING),
  });
  const x = useTransform(swipe.offset, (offset) => offset / 3);
  useStageStatus(
    swipe.state === 'tracking'
      ? 'The card has the touch'
      : heard
        ? 'The card heard it; the sidebar did not'
        : undefined,
  );

  return (
    <div className="absolute inset-0 grid place-items-center">
      <motion.div
        data-heard={heard || undefined}
        className="grid size-16 place-items-center rounded-full bg-muted text-muted-foreground transition-colors data-heard:bg-primary data-heard:text-primary-foreground"
        style={{ x }}
      >
        <ArrowRightIcon className="size-6" />
      </motion.div>
    </div>
  );
}
