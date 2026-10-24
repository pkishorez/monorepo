import { SwipeRow } from '@kestack/web-platform/recipes/swipe-row';
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
} from '@kestack/web-platform/ui/components/lucide';
import { useDevice } from '@kestack/web-platform/ui/input';
import type { ReactNode } from 'react';
import { notify } from '../../../../ui/toast/index.ts';

/*
 * On a touch screen a Session row swipes left to right: an unsettled one
 * to Settle it, a Settled one to un-Settle it, with a quiet "Settle" or
 * "Keep" behind it as it goes. It slides out, the list closes the gap, and
 * a toast offers Undo for five seconds. With no touch screen the row is
 * drawn as it is.
 */

/** Settles the Session, or un-Settles it, and says so with an Undo. */
export const moveWithUndo = (
  title: string,
  settled: boolean,
  move: (settled: boolean) => void,
) => {
  move(settled);
  notify({
    title: settled ? 'Settled' : 'Back among your sessions',
    description: title,
    action: { label: 'Undo', onClick: () => move(!settled) },
  });
};

export function SwipeToMove({
  settled,
  onMove,
  children,
}: {
  /** Whether the row is a Settled one: its swipe un-Settles. */
  readonly settled: boolean;
  /** Runs with where the Session goes, once the row has gone. */
  readonly onMove: (settled: boolean) => void;
  readonly children: ReactNode;
}) {
  const { touch } = useDevice();
  if (!touch) return children;
  return (
    <SwipeRow
      direction="right"
      tone="quiet"
      sounds={false}
      className="rounded-md bg-sidebar"
      label={
        settled ? (
          <>
            <ArchiveRestoreIcon aria-hidden /> Keep
          </>
        ) : (
          <>
            <ArchiveIcon aria-hidden /> Settle
          </>
        )
      }
      onSwipe={() => onMove(!settled)}
    >
      {children}
    </SwipeRow>
  );
}
