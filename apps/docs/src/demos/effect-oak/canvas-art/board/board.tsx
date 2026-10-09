import type { UseFrame } from 'effect-oak/react';
import { FrameCanvas } from '../../frame-canvas/index.js';

/** One ball as drawn: where it is, how big, what color. */
type Drawn = {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly color: string;
};

/** The box on a canvas, with every ball where `ballsAt` says at each Frame. */
export const Board = ({
  width,
  height,
  useFrame,
  ballsAt,
  onPress,
}: {
  readonly width: number;
  readonly height: number;
  readonly useFrame: UseFrame;
  readonly ballsAt: (at: number) => ReadonlyArray<Drawn>;
  readonly onPress: (point: { readonly x: number; readonly y: number }) => void;
}) => (
  <FrameCanvas
    width={width}
    height={height}
    useFrame={useFrame}
    label="Balls bouncing in a box"
    className="w-full max-w-[600px] cursor-crosshair rounded-lg shadow-2xl"
    onPress={onPress}
    draw={(context, at) => {
      context.fillStyle = '#0a0a0f';
      context.fillRect(0, 0, width, height);
      for (const ball of ballsAt(at)) {
        context.beginPath();
        context.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
        context.fillStyle = ball.color;
        context.fill();
      }
    }}
  />
);
