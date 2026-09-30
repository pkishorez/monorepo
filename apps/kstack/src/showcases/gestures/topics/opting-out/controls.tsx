import { Input } from '@kstackz/ui-toolkit/components/ui/input';
import { Slider } from '@kstackz/ui-toolkit/components/ui/slider';
import { useSwipe } from '@kstackz/use-gesture/recognizers';
import { animate, motion, useTransform } from 'motion/react';
import { type PointerEvent, useRef, useState } from 'react';
import { useStageStatus } from '../../stage/index.ts';

const SPRING = { type: 'spring', stiffness: 500, damping: 45 } as const;

/**
 * A pad to draw on, with the pointer events it needs. Marked
 * `data-zone-gesture="disabled"`, so the zone never takes its touch.
 */
function Pad(props: { readonly onDrawing: (drawing: boolean) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const draw = (event: PointerEvent<HTMLCanvasElement>) => {
    const context = canvas.current?.getContext('2d');
    if (!context || event.buttons === 0) return;
    const box = event.currentTarget.getBoundingClientRect();
    context.lineTo(event.clientX - box.left, event.clientY - box.top);
    context.stroke();
  };
  return (
    <canvas
      ref={canvas}
      data-zone-gesture="disabled"
      width={240}
      height={96}
      className="h-24 w-60 touch-none rounded-md bg-muted"
      onPointerDown={(event) => {
        const context = canvas.current?.getContext('2d');
        if (!context) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        const box = event.currentTarget.getBoundingClientRect();
        context.lineWidth = 2;
        context.lineCap = 'round';
        context.strokeStyle = getComputedStyle(event.currentTarget).color;
        context.beginPath();
        context.moveTo(event.clientX - box.left, event.clientY - box.top);
        props.onDrawing(true);
      }}
      onPointerMove={draw}
      onPointerUp={() => props.onDrawing(false)}
      onPointerCancel={() => props.onDrawing(false)}
    />
  );
}

/**
 * A text field, a slider and a pad to draw on, in a zone that listens for a
 * Swipe left or right. Each control keeps its own touch.
 */
export function Controls() {
  const [volume, setVolume] = useState(40);
  const [drawing, setDrawing] = useState(false);
  const left = useSwipe({
    direction: 'left',
    onCommit: () => animate(left.offset, 0, SPRING),
    onCancel: () => animate(left.offset, 0, SPRING),
  });
  const right = useSwipe({
    direction: 'right',
    onCommit: () => animate(right.offset, 0, SPRING),
    onCancel: () => animate(right.offset, 0, SPRING),
  });
  const x = useTransform(() => (right.offset.get() - left.offset.get()) / 2);
  const swiping = left.state === 'tracking' || right.state === 'tracking';
  useStageStatus(
    swiping ? 'The zone has it' : drawing ? 'The pad has it' : undefined,
  );

  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6"
      style={{ x }}
    >
      <Input placeholder="Type here" className="max-w-60" />
      <div data-zone-gesture="disabled" className="w-60 py-2">
        <Slider
          value={volume}
          onValueChange={(value) => setVolume(value as number)}
        />
      </div>
      <Pad onDrawing={setDrawing} />
    </motion.div>
  );
}
