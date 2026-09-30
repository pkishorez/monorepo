import { GestureZone } from '@kstackz/use-gesture';
import { useGesture } from '@kstackz/use-gesture/core';
import { useEffect, useState } from 'react';
import { useStageStatus } from '../../stage/index.ts';

/** A ring around its zone that lights while the zone hears a Gesture. */
function Ring(props: { readonly onHear: (heard: boolean) => void }) {
  const { active } = useGesture();
  const { onHear } = props;
  useEffect(() => onHear(active), [onHear, active]);
  return (
    <span
      data-active={active || undefined}
      className="pointer-events-none absolute inset-0 rounded-[inherit] ring-2 ring-transparent transition-shadow duration-150 ring-inset data-active:ring-primary"
    />
  );
}

/**
 * Two zones side by side. A touch in one is never heard by the other, even
 * when a later finger lands there.
 */
export function Siblings() {
  const [left, setLeft] = useState(false);
  const [right, setRight] = useState(false);
  useStageStatus(
    left ? 'Only left heard it' : right ? 'Only right heard it' : undefined,
  );

  return (
    <div className="absolute inset-4 grid grid-cols-2 gap-4">
      <GestureZone className="relative rounded-lg bg-muted">
        <Ring onHear={setLeft} />
        <span className="absolute top-3 left-3 text-xs text-muted-foreground">
          Left
        </span>
      </GestureZone>
      <GestureZone className="relative rounded-lg bg-muted">
        <Ring onHear={setRight} />
        <span className="absolute top-3 left-3 text-xs text-muted-foreground">
          Right
        </span>
      </GestureZone>
    </div>
  );
}
