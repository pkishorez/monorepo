import { useRef } from 'react';
import type { PointerEvent } from 'react';
import { useMotionValueEvent } from 'motion/react';
import type { MotionValue } from 'motion/react';

/*
 * A 2D canvas drawn at every Frame. `draw` paints the whole picture at a
 * Frame's Time, through the context: once on every render (a new Model) at
 * the Frame as it stands, then at every change of the Frame, with no render.
 * Pointer events come back in the canvas's own units, whatever size it is
 * shown at.
 */

type Point = { readonly x: number; readonly y: number };

/** Where a pointer event is, in the canvas's own units. */
const pointOf = (
  event: PointerEvent<HTMLCanvasElement>,
  width: number,
  height: number,
): Point => {
  const box = event.currentTarget.getBoundingClientRect();
  return {
    x: ((event.clientX - box.left) / box.width) * width,
    y: ((event.clientY - box.top) / box.height) * height,
  };
};

export const FrameCanvas = ({
  width,
  height,
  frame,
  draw,
  label,
  className,
  onPress,
  onMove,
  onLeave,
}: {
  /** The picture's size, in its own units. */
  readonly width: number;
  readonly height: number;
  readonly frame: MotionValue<number>;
  /** Paint the picture as it is at Time `at`. */
  readonly draw: (context: CanvasRenderingContext2D, at: number) => void;
  /** What the picture shows, for screen readers. */
  readonly label: string;
  readonly className?: string;
  readonly onPress?: (point: Point) => void;
  readonly onMove?: (point: Point) => void;
  readonly onLeave?: () => void;
}) => {
  const canvas = useRef<HTMLCanvasElement>(null);

  const paint = (at: number) => {
    const element = canvas.current;
    const context = element?.getContext('2d');
    if (!element || !context) return;
    const scale = window.devicePixelRatio || 1;
    if (element.width !== width * scale) {
      element.width = width * scale;
      element.height = height * scale;
    }
    context.setTransform(scale, 0, 0, scale, 0, 0);
    draw(context, at);
  };
  useMotionValueEvent(frame, 'change', paint);

  return (
    <canvas
      ref={(element) => {
        canvas.current = element;
        // A new callback each render, so React calls it after every commit:
        // the picture is painted for the new Model before the browser shows it.
        paint(frame.get());
      }}
      role="img"
      aria-label={label}
      className={className}
      style={{ aspectRatio: `${width} / ${height}` }}
      onPointerDown={
        onPress && ((event) => onPress(pointOf(event, width, height)))
      }
      onPointerMove={
        onMove && ((event) => onMove(pointOf(event, width, height)))
      }
      onPointerLeave={onLeave}
    />
  );
};
