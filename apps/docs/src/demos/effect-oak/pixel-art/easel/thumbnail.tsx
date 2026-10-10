/** A small picture of a grid, painted after every render. */
export const Thumbnail = ({
  grid,
  colors,
  empty,
}: {
  readonly grid: ReadonlyArray<ReadonlyArray<number | null>>;
  readonly colors: ReadonlyArray<string>;
  readonly empty: string;
}) => {
  const paint = (canvas: HTMLCanvasElement | null) => {
    const context = canvas?.getContext('2d');
    if (!context) return;
    grid.forEach((row, y) =>
      row.forEach((cell, x) => {
        context.fillStyle = cell === null ? empty : (colors[cell] ?? empty);
        context.fillRect(x, y, 1, 1);
      }),
    );
  };
  return (
    <canvas
      ref={paint}
      width={grid.length}
      height={grid.length}
      className="size-12 border border-neutral-700 [image-rendering:pixelated]"
    />
  );
};
