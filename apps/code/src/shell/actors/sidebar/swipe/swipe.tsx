import { SwipeRow } from '@kestack/web-platform/recipes/swipe-row';
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
} from '@kestack/web-platform/ui/components/lucide';
import { useDevice } from '@kestack/web-platform/ui/input';
import { createContext, type ReactNode, use } from 'react';
import { notify } from '../../../../ui/toast/index.ts';

/*
 * On a touch screen a Session row swipes left to right: an unsettled one
 * to Settle it, a Settled one to un-Settle it, with a quiet "Settle" or
 * "Keep" behind it as it goes. It slides out, the list closes the gap, and
 * a toast offers Undo for five seconds; its Machine is asked at once, and
 * Undo asks it back. A refusal brings its row back afresh (`SwipeBack`),
 * even one never taken out of its list, and no other. With no touch
 * screen the row is drawn as it is.
 */

/** How many of a Session's Moves were refused: each brings its row back, drawn afresh. */
export const SwipeBack = createContext<
  (machineId: string, sessionId: string) => number
>(() => 0);

/** Says a Session was Settled, or un-Settled, with an Undo for `seconds`. */
export const sayMoved = (
  title: string,
  settled: boolean,
  undo: () => void,
  seconds: number,
) =>
  notify({
    title: settled ? 'Settled' : 'Back among your sessions',
    description: title,
    seconds,
    action: { label: 'Undo', onClick: undo },
  });

export function SwipeToMove({
  machineId,
  sessionId,
  settled,
  onMove,
  children,
}: {
  /** The Session the row is, by its Machine and its id. */
  readonly machineId: string;
  readonly sessionId: string;
  /** Whether the row is a Settled one: its swipe un-Settles. */
  readonly settled: boolean;
  /** Runs with where the Session goes, once the row has gone. */
  readonly onMove: (settled: boolean) => void;
  readonly children: ReactNode;
}) {
  const { touch } = useDevice();
  const back = use(SwipeBack)(machineId, sessionId);
  if (!touch) return children;
  return (
    <SwipeRow
      key={back}
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
