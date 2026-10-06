import { Trash2 } from '@kstackz/ui-toolkit/lucide';
import { cn } from '@kstackz/ui-toolkit/utils';
import { GestureZone, useSwipe } from '@kstackz/use-gesture/web';
import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
} from 'motion/react';
import { type ReactNode, useRef, useState } from 'react';
import { useSettings } from '../../../app/index.ts';
import { play } from '../../../kit/sound/index.ts';

// How far, in px, the row goes left before letting go deletes it.
const DELETE_AT = 112;

const SPRING = { type: 'spring', duration: 0.35, bounce: 0.15 } as const;

/**
 * A row that one finger swipes left to delete. As it goes, Delete shows
 * behind it; past DELETE_AT it arms, with a click and a buzz, and letting
 * go then slides it away and deletes it. Coming back short, or letting go
 * before, springs it home. A mouse never swipes it: keys delete instead.
 */
export function SwipeRow(props: {
  readonly onDelete: () => void;
  readonly children: ReactNode;
}) {
  // The row is a Gesture Zone of its own, so its Swipe hears only it.
  return (
    <GestureZone className="relative overflow-hidden rounded-lg">
      <Swiped {...props} />
    </GestureZone>
  );
}

function Swiped(props: {
  readonly onDelete: () => void;
  readonly children: ReactNode;
}) {
  const settings = useSettings();
  const row = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const [armed, setArmed] = useState(false);
  const shown = useTransform(x, [0, -24], [0, 1]);
  const latest = useRef({ props, sounds: settings.sound });
  latest.current = { props, sounds: settings.sound };

  const home = () => void animate(x, 0, SPRING);
  const swipe = useSwipe({
    direction: 'left',
    commit: { distance: DELETE_AT },
    onCommit: () => {
      const width = row.current?.offsetWidth ?? 400;
      if (latest.current.sounds) play('success');
      void animate(x, -width, { duration: 0.18, ease: [0.4, 0, 1, 1] }).then(
        () => latest.current.props.onDelete(),
      );
    },
    onCancel: home,
  });

  useMotionValueEvent(swipe.offset, 'change', (offset) => x.set(-offset));
  useMotionValueEvent(swipe.willCommit, 'change', (will) => {
    setArmed(will);
    if (!will) return;
    if (latest.current.sounds) play('arm');
    navigator.vibrate?.(8);
  });

  return (
    <>
      <motion.div
        aria-hidden="true"
        style={{ opacity: shown }}
        className={cn(
          'absolute inset-0 flex items-center justify-end gap-2 rounded-lg pr-5 text-sm font-medium text-destructive transition-colors duration-150',
          armed ? 'bg-destructive/20' : 'bg-destructive/10',
        )}
      >
        <motion.span
          animate={{ scale: armed ? 1.15 : 1 }}
          transition={{ type: 'spring', duration: 0.3, bounce: 0.45 }}
          className="flex items-center gap-1.5"
        >
          <Trash2 className="size-4" aria-hidden="true" /> Delete
        </motion.span>
      </motion.div>
      <motion.div ref={row} style={{ x }} className="relative bg-background">
        {props.children}
      </motion.div>
    </>
  );
}
