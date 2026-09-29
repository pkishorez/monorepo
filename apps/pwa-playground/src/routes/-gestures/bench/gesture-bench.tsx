import { useGesture } from '@kstackz/ui-toolkit/components/blocks/gestures';
import { useMotionValueEvent } from '@kstackz/ui-toolkit/motion';
import { useRef } from 'react';
import { Bench, Lane, signed, useNote, usePuck } from './bench.tsx';

function GestureLane(props: { readonly hold: boolean }) {
  const { hold } = props;
  const note = useNote();
  const puck = usePuck();
  const readout = useRef<HTMLSpanElement>(null);
  const name = `useGesture({ hold: ${hold} })`;
  const gesture = useGesture({
    hold,
    onEnd: (end) => {
      note(
        `${name} end · ${signed(end.x)}, ${signed(end.y)} · ×${end.scale.toFixed(2)} · ${signed(end.rotation, '°')}${end.interrupted ? ' · interrupted' : ''}`,
      );
      puck.home();
    },
  });
  const show = () => {
    const { x, y, scale, rotation } = gesture;
    puck.x.jump(x.get());
    puck.y.jump(y.get());
    puck.scale.jump(scale.get());
    puck.rotate.jump(rotation.get());
    if (readout.current !== null) {
      readout.current.textContent = `x ${signed(x.get())} · y ${signed(y.get())} · ×${scale.get().toFixed(2)} · ${signed(rotation.get(), '°')}`;
    }
  };
  useMotionValueEvent(gesture.x, 'change', show);
  useMotionValueEvent(gesture.y, 'change', show);
  useMotionValueEvent(gesture.scale, 'change', show);
  useMotionValueEvent(gesture.rotation, 'change', show);
  return (
    <Lane
      title={name}
      hold={hold}
      active={gesture.active}
      puck={puck}
      readout={readout}
    />
  );
}

/**
 * useGesture with no Hold and under the Hold. A pinch is expected here, so
 * the Hold takes a still press in the corner until the ring fills.
 */
export function GestureBench() {
  return (
    <Bench how="Pan with one finger, pinch and turn with two. A pinch is expected, so for the Hold press the bottom-left corner until the ring fills and it clicks, then pan or pinch with other fingers.">
      <GestureLane hold={false} />
      <GestureLane hold />
    </Bench>
  );
}
