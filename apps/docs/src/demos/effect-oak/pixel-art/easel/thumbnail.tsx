import { useEffect, useRef } from 'react';

/** A small picture of a grid, drawn once per grid. */
export const Thumbnail = ({
  grid,
  colors,
  empty,
}: {
  readonly grid: ReadonlyArray<ReadonlyArray<number | null>>;
  readonly colors: ReadonlyArray<string>;
  readonly empty: string;
}) => {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const context = canvas.current?.getContext('2d');
    if (!context) return;
    grid.forEach((row, y) =>
      row.forEach((cell, x) => {
        context.fillStyle = cell === null ? empty : (colors[cell] ?? empty);
        context.fillRect(x, y, 1, 1);
      }),
    );
  }, [grid, colors, empty]);
  return (
    <canvas
      ref={canvas}
      width={grid.length}
      height={grid.length}
      className="size-12 border border-neutral-700 [image-rendering:pixelated]"
    />
  );
};
