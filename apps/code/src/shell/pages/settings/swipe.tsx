import { GestureZone, useSwipe } from '@kestack/web-platform/ui/input';
import type { ReactNode } from 'react';
import type { SettingsTab } from '../../routes/index.ts';

/*
 * On a touch screen the Settings page swipes between its tabs: right to
 * left to the next, left to right to the one before. A way with no tab
 * there, such as before the first, is left to the zone around it, the App
 * Shell's, whose swipe opens the sidebar. Up and down it wants nothing:
 * the page scrolls.
 */

/** A Swipe past this many px, or flicked past this many px/s, counts. */
const SWIPE = { distance: 56, velocity: 400 } as const;

/** The tabs on either side of the one open, among those shown; null where there is none. */
export const besideOf = (
  shown: ReadonlyArray<SettingsTab>,
  open: SettingsTab,
): {
  readonly before: SettingsTab | null;
  readonly after: SettingsTab | null;
} => {
  const at = shown.indexOf(open);
  return {
    before: at > 0 ? shown[at - 1]! : null,
    after: at !== -1 && at < shown.length - 1 ? shown[at + 1]! : null,
  };
};

export function TabSwipe({
  open,
  shown,
  enabled,
  onSwipe,
  className,
  children,
}: {
  readonly open: SettingsTab;
  readonly shown: ReadonlyArray<SettingsTab>;
  /** On a touch screen only. */
  readonly enabled: boolean;
  readonly onSwipe: (tab: SettingsTab) => void;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  const { before, after } = besideOf(shown, open);
  return (
    <GestureZone className={className}>
      <Swiping direction="left" to={enabled ? after : null} onSwipe={onSwipe} />
      <Swiping
        direction="right"
        to={enabled ? before : null}
        onSwipe={onSwipe}
      />
      {children}
    </GestureZone>
  );
}

/** One way's Swipe, wanted only while there is a tab that way. */
function Swiping({
  direction,
  to,
  onSwipe,
}: {
  readonly direction: 'left' | 'right';
  readonly to: SettingsTab | null;
  readonly onSwipe: (tab: SettingsTab) => void;
}) {
  useSwipe({
    enabled: to !== null,
    direction,
    commit: SWIPE,
    onCommit: () => {
      if (to !== null) onSwipe(to);
    },
  });
  return null;
}
