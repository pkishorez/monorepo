import Delete02Icon from '@hugeicons/core-free-icons/Delete02Icon';
import type { ReactNode } from 'react';
import { Glyph } from '../../components/glyph';
import { Swipe } from '../../components/swipe';
import { cn } from '../../theme';

/**
 * A row one finger swipes left to delete, as on the web: Delete shows
 * behind it as it goes; carried far enough, letting go deletes it, with a
 * tick of the phone as it arms; short of that it opens on Delete, to tap,
 * or springs home. A screen reader gets Delete as the row's action.
 *
 * ```tsx
 * <SwipeRow onDelete={() => remove(entry)} haptics={settings.haptics}>
 *   <EntryRow entry={entry} />
 * </SwipeRow>
 * ```
 */
export function SwipeRow(props: {
  /** Runs once the row is let go past the line, or Delete is tapped. */
  onDelete: () => void;
  /** What the action says. Default `Delete`. */
  label?: string;
  /** Tick as the swipe arms. Default true. */
  haptics?: boolean;
  /** Extra classes for the row, such as its rounding. */
  className?: string;
  children: ReactNode;
}) {
  return (
    <Swipe
      haptics={props.haptics ?? true}
      className={cn('rounded-lg', props.className)}
      contentClassName="bg-background"
    >
      {props.children}
      <Swipe.End>
        <Swipe.Action
          color="destructive"
          label={props.label ?? 'Delete'}
          icon={<Glyph icon={Delete02Icon} />}
          onPress={props.onDelete}
        />
      </Swipe.End>
    </Swipe>
  );
}
