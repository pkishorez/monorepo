import {
  useSwipe,
  useTap,
} from '@kstackz/ui-toolkit/components/blocks/gestures';
import { useMotionValueEvent } from '@kstackz/ui-toolkit/motion';
import { useRef, useState } from 'react';
import { Bench, Lane, PuckShape, signed, useNote, usePuck } from './bench.tsx';

function SwipeTapLane(props: { readonly hold: boolean }) {
  const { hold } = props;
  const note = useNote();
  const puck = usePuck();
  const readout = useRef<HTMLSpanElement>(null);
  const [taps, setTaps] = useState(0);
  const swipe = useSwipe({
    hold,
    onEnd: (end) => {
      note(
        `useSwipe({ hold: ${hold} }) end · ${end.axis} ${signed(end.distance)}px · ${Math.round(end.velocity)}px/s${end.interrupted ? ' · interrupted' : ''}`,
      );
      puck.home();
    },
  });
  useTap({
    hold,
    onTap: ({ point }) => {
      setTaps((count) => count + 1);
      note(
        `useTap({ hold: ${hold} }) · ${Math.round(point.x)}, ${Math.round(point.y)}`,
      );
    },
  });
  const show = (axis: 'x' | 'y') => (value: number) => {
    (axis === 'x' ? puck.x : puck.y).jump(value);
    if (readout.current !== null) {
      readout.current.textContent = `${axis} ${signed(value)}px`;
    }
  };
  useMotionValueEvent(swipe.dx, 'change', show('x'));
  useMotionValueEvent(swipe.dy, 'change', show('y'));
  return (
    <Lane
      title={`useSwipe + useTap({ hold: ${hold} })`}
      hold={hold}
      active={swipe.active}
      readout={readout}
      badge={
        <span className="font-mono text-[11px] text-muted-foreground">
          taps {taps}
        </span>
      }
    >
      <PuckShape puck={puck} hold={hold} active={swipe.active} />
    </Lane>
  );
}

/**
 * useSwipe and useTap with no Hold and under the Hold. One finger only, so
 * the Hold starts as soon as a second finger lands beside the corner
 * finger.
 */
export function SwipeTapBench() {
  return (
    <Bench how="Swipe along one axis, or tap. A tap with no Hold also clicks what is under it. For the Hold, rest a finger on the bottom-left corner, then swipe or tap with another; it starts at once.">
      <SwipeTapLane hold={false} />
      <SwipeTapLane hold />
    </Bench>
  );
}
