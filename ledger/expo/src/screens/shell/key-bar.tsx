import { KeyBar as Bar } from '@kstackz/expo-platform/recipes/key-bar';
import { keys, useGiven } from '@ledger/core/app/commands';
import { useState } from 'react';

// Above the Add button, as the web raises it on a touch screen.
const ABOVE_ADD = 92;

/**
 * The Key Bar on a phone: the Command a tap just gave, for a moment, above
 * the Add button. With no keys there is nothing still to press; a Go given
 * by the Thumb Lock stays quiet, as the picker showed it already. A
 * Command given before it mounted, in another User's Session, stays unsaid.
 */
export function KeyBar() {
  const given = useGiven();
  const { actions } = keys.useStatus();
  const [mounted] = useState(() => performance.now());
  const action =
    given === undefined || given.at < mounted
      ? undefined
      : actions.find((each) => each.id === given.id);
  return (
    <Bar
      message={
        given === undefined || action === undefined
          ? undefined
          : { key: given.at, label: action.description }
      }
      above={ABOVE_ADD}
    />
  );
}
