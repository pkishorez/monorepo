import { Switch } from '@kstackz/ui-toolkit/components/ui/switch';
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

/** A zone inside a zone, trapped by a switch: then the outer one goes quiet. */
export function Trapped() {
  const [trapped, setTrapped] = useState(false);
  const [outer, setOuter] = useState(false);
  const [inner, setInner] = useState(false);
  useStageStatus(
    outer && inner
      ? 'Outer + inner heard it'
      : inner
        ? 'Only the inner heard it'
        : outer
          ? 'Only the outer heard it'
          : undefined,
  );

  return (
    <GestureZone className="absolute inset-4 rounded-lg bg-muted/40">
      <Ring onHear={setOuter} />
      <span className="absolute top-3 left-3 text-xs text-muted-foreground">
        Outer
      </span>
      <GestureZone
        trapped={trapped}
        className="absolute inset-x-8 top-12 bottom-8 rounded-lg bg-muted"
      >
        <Ring onHear={setInner} />
        <span className="absolute top-3 left-3 text-xs text-muted-foreground">
          Inner
        </span>
        <label
          data-zone-gesture="disabled"
          className="absolute top-2 right-2 flex items-center gap-2 p-1 text-xs"
        >
          Trapped
          <Switch checked={trapped} onCheckedChange={setTrapped} />
        </label>
      </GestureZone>
    </GestureZone>
  );
}
