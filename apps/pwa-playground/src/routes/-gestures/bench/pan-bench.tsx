import { usePan } from '@kstackz/ui-toolkit/components/blocks/gestures';
import { useMotionValueEvent } from '@kstackz/ui-toolkit/motion';
import { useRef } from 'react';
import { Bench, Lane, PuckShape, signed, useNote, usePuck } from './bench.tsx';

function PanLane(props: { readonly hold: boolean }) {
  const { hold } = props;
  const note = useNote();
  const puck = usePuck();
  const readout = useRef<HTMLSpanElement>(null);
  const name = `usePan({ hold: ${hold} })`;
  const pan = usePan({
    hold,
    onEnd: (end) => {
      const speed = Math.hypot(end.velocity.x, end.velocity.y);
      note(
        `${name} end · ${signed(end.x)}, ${signed(end.y)} · ${Math.round(speed)}px/s${end.interrupted ? ' · interrupted' : ''}`,
      );
      puck.home();
    },
  });
  const show = () => {
    puck.x.jump(pan.x.get());
    puck.y.jump(pan.y.get());
    if (readout.current !== null) {
      readout.current.textContent = `x ${signed(pan.x.get())} · y ${signed(pan.y.get())}`;
    }
  };
  useMotionValueEvent(pan.x, 'change', show);
  useMotionValueEvent(pan.y, 'change', show);
  return (
    <Lane title={name} hold={hold} active={pan.active} readout={readout}>
      <PuckShape puck={puck} hold={hold} active={pan.active} />
    </Lane>
  );
}

/**
 * usePan with no Hold and under the Hold. One finger only, so the Hold
 * starts as soon as a second finger lands beside the corner finger.
 */
export function PanBench() {
  return (
    <Bench how="One finger only: drag anywhere to pan. For the Hold, rest a finger on the bottom-left corner, then drag with another; it starts at once.">
      <PanLane hold={false} />
      <PanLane hold />
    </Bench>
  );
}
