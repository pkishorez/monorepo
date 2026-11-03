import type { ReactNode } from 'react';
import { GestureZone } from '@kestack/web-platform/ui/input';

/*
 * Where a sideways drag is the page's own, not the menu's: code that
 * scrolls sideways, and a running example. Its own Gesture Zone keeps
 * every swipe that starts in it, and wanting none, leaves it to the
 * browser, so a swipe right scrolls the code rather than opening the menu.
 * Text in it stays selectable.
 */

const SELECTABLE = {
  userSelect: 'auto',
  WebkitUserSelect: 'auto',
  WebkitTouchCallout: 'default',
} as const;

export function OwnTouch({
  className,
  children,
}: {
  readonly className?: string;
  readonly children: ReactNode;
}) {
  return (
    <GestureZone trapped style={SELECTABLE} className={className}>
      {children}
    </GestureZone>
  );
}
