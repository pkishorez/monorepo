import { createPortal } from 'react-dom';
import { useEnvironment, useZoneSource } from '../provider';
import { DebugOverlay } from './debug-overlay';
import { FingerLayer } from './fingers';

/**
 * Shows every finger under the enclosing GestureProvider by what it is
 * doing: a soft ring while undecided, with a bubble growing inside while it
 * rests; the Hold popping as it locks, then glowing with its zone dimmed
 * around it and a "Left Hold" chip; a comet tail behind a moving finger; a
 * burst for each tap. Paints only while fingers are down or fading, and
 * takes no input. Render it anywhere inside a zone; it covers every zone
 * under the provider, with or without the debug overlay.
 */
export function GestureFingers() {
  const source = useZoneSource('GestureFingers');
  if (source === undefined) return null;
  return createPortal(<FingerLayer source={source} />, document.body);
}

/**
 * Shows what the zones under the enclosing GestureProvider see: each zone
 * outlined with its scroll rule, the edge strips labelled with who owns
 * them, native scrollers, every finger's pointer id, the Environment in one
 * line, and the gestures state machine of the zone touched last with its
 * current state lit. `machineClassName` places the machine
 * (`position: fixed`; a strip along the top by default): put it where it
 * covers nothing you touch. It never takes input.
 */
export function GestureDebugOverlay(props: {
  readonly machineClassName?: string;
}) {
  const source = useZoneSource('GestureDebugOverlay');
  const environment = useEnvironment();
  if (source === undefined) return null;
  return createPortal(
    <DebugOverlay
      source={source}
      environment={environment}
      machineClassName={props.machineClassName}
    />,
    document.body,
  );
}
