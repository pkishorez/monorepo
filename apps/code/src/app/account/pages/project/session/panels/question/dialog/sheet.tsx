import { SWIPE_DISMISS } from '@kestack/web-platform/recipes/touch-layers';
import {
  GestureProvider,
  GestureZone,
  useSwipe,
} from '@kestack/web-platform/ui/input';
import { useMotionValueEvent } from 'motion/react';
import type { ReactNode, RefObject } from 'react';

/*
 * The dialog as a sheet, on a device with no keyboard: a swipe down its
 * head minimises it. The sheet follows the finger with no transition; let
 * go past the Touch Layers' `SWIPE_DISMISS`, 80px or a flick of 500px/s,
 * as a Drawer is, it minimises, sliding the rest of the way by its
 * transition from where it is; let go short, it springs back. The swipe is
 * a Gesture Zone's, as a Drawer's is, so every sheet dismisses alike.
 */

export function SwipeHead({
  sheet,
  on,
  onMinimise,
  className,
  children,
}: {
  /** What follows the finger. */
  readonly sheet: RefObject<HTMLElement | null>;
  /** Whether a swipe is heard: while it is expanded. */
  readonly on: boolean;
  readonly onMinimise: () => void;
  readonly className: string;
  readonly children: ReactNode;
}) {
  return (
    // The app's, when it has one; else its own.
    <GestureProvider>
      <GestureZone className={className}>
        <Following sheet={sheet} on={on} onMinimise={onMinimise} />
        {children}
      </GestureZone>
    </GestureProvider>
  );
}

function Following({
  sheet,
  on,
  onMinimise,
}: {
  readonly sheet: RefObject<HTMLElement | null>;
  readonly on: boolean;
  readonly onMinimise: () => void;
}) {
  /** Down by `offset` px, at once; at 0, back to its own place and motion. */
  const move = (offset: number) => {
    const element = sheet.current;
    if (element === null) return;
    element.style.transition = offset === 0 ? '' : 'none';
    element.style.translate = offset === 0 ? '' : `0 ${offset}px`;
  };
  const swipe = useSwipe({
    direction: 'down',
    enabled: on,
    commit: SWIPE_DISMISS,
    onCommit: () => {
      move(0);
      onMinimise();
    },
    onCancel: () => move(0),
  });
  useMotionValueEvent(swipe.offset, 'change', (offset) => {
    if (swipe.state === 'tracking' || offset > 0) move(offset);
  });
  return null;
}
