import {
  type GestureValues,
  type Point,
  useGesture,
} from '@kstackz/ui-toolkit/components/blocks/gestures';
import { useMotionValueEvent } from '@kstackz/ui-toolkit/motion';
import { cn } from '@kstackz/ui-toolkit/utils';
import { useLayoutEffect, useRef } from 'react';
import { Bench, Lane, signed, useNote } from './bench.tsx';

const CARD = 96;

// Whether a Gesture changed nothing: a Tap, or fingers that settled back.
const unmoved = (values: GestureValues) =>
  Math.hypot(values.x, values.y) < 1 &&
  Math.abs(values.scale - 1) < 0.01 &&
  Math.abs(values.rotation) < 0.5;

function GestureLane(props: { readonly hold: boolean }) {
  const { hold } = props;
  const note = useNote();
  const readout = useRef<HTMLSpanElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);
  // Where the card sits in the stage's px, before the Gesture under way.
  const placed = useRef<DOMMatrix | undefined>(undefined);
  const origin = useRef<Point | undefined>(undefined);
  const name = `useGesture({ hold: ${hold} })`;

  // A Gesture as a matrix in the stage's px: scaled and turned about where
  // it started, then moved by x and y. What was under the fingers stays
  // under them.
  const matrixOf = (values: GestureValues, start: Point) => {
    const box = stage.current?.getBoundingClientRect();
    const o = { x: start.x - (box?.left ?? 0), y: start.y - (box?.top ?? 0) };
    return new DOMMatrix()
      .translate(o.x + values.x, o.y + values.y)
      .rotate(values.rotation)
      .scale(values.scale)
      .translate(-o.x, -o.y);
  };

  const draw = (live?: DOMMatrix) => {
    if (card.current === null || placed.current === undefined) return;
    const shown =
      live === undefined ? placed.current : live.multiply(placed.current);
    card.current.style.transform = shown.toString();
  };

  const reset = () => {
    const box = stage.current;
    if (box === null) return;
    placed.current = new DOMMatrix().translate(
      (box.clientWidth - CARD) / 2,
      (box.clientHeight - CARD) / 2,
    );
    draw();
  };

  useLayoutEffect(reset, []);

  const gesture = useGesture({
    hold,
    onEnd: (end) => {
      if (unmoved(end) && !end.interrupted) return;
      note(
        `${name} end · ${signed(end.x)}, ${signed(end.y)} · ×${end.scale.toFixed(2)} · ${signed(end.rotation, '°')}${end.interrupted ? ' · interrupted' : ''}`,
      );
      // An interrupted Gesture is dropped: the card goes back.
      if (!end.interrupted && placed.current !== undefined) {
        placed.current = matrixOf(end, end.origin).multiply(placed.current);
      }
      draw();
    },
  });

  useLayoutEffect(() => {
    origin.current = gesture.origin;
  }, [gesture.origin]);

  const show = () => {
    const values = {
      x: gesture.x.get(),
      y: gesture.y.get(),
      scale: gesture.scale.get(),
      rotation: gesture.rotation.get(),
    };
    if (origin.current !== undefined) draw(matrixOf(values, origin.current));
    if (readout.current !== null) {
      readout.current.textContent = `x ${signed(values.x)} · y ${signed(values.y)} · ×${values.scale.toFixed(2)} · ${signed(values.rotation, '°')}`;
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
      readout={readout}
      badge={
        <button
          type="button"
          onClick={reset}
          className="rounded-md border border-border px-2 py-0.5 text-[11px] text-muted-foreground"
        >
          Reset
        </button>
      }
    >
      <div ref={stage} className="relative size-full self-stretch">
        <div
          ref={card}
          aria-hidden="true"
          style={{ width: CARD, height: CARD }}
          className={cn(
            'pointer-events-none absolute top-0 left-0 flex origin-top-left flex-col items-center justify-center rounded-xl border-2 font-mono text-[10px] shadow-sm',
            hold
              ? 'border-amber-500 bg-amber-500/15 text-amber-600 dark:text-amber-400'
              : 'border-primary bg-primary/10 text-primary',
          )}
        >
          <span className="text-base">▲</span>
          <span>top</span>
        </div>
      </div>
    </Lane>
  );
}

/**
 * useGesture with no Hold and under the Hold. Each lane's card follows the
 * fingers as they pan, pinch and turn, and stays where they leave it. A
 * pinch is expected here, so the Hold takes a still press in the corner
 * until the ring fills.
 */
export function GestureBench() {
  return (
    <Bench how="Pan with one finger, pinch and turn with two: the card stays under your fingers. For the Hold press the bottom-left corner until the ring fills (a buzz on Android, a click on iOS), then pan or pinch with other fingers.">
      <GestureLane hold={false} />
      <GestureLane hold />
    </Bench>
  );
}
