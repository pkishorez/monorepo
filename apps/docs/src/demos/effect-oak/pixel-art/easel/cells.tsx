type Cell = number | null;

/**
 * The picture as a grid of square cells. Pressing a cell and entering one
 * with the button held are reported; `preview` cells are outlined.
 */
export const Cells = ({
  grid,
  colors,
  empty,
  preview,
  onPress,
  onEnter,
  onLeave,
}: {
  readonly grid: ReadonlyArray<ReadonlyArray<Cell>>;
  readonly colors: ReadonlyArray<string>;
  readonly empty: string;
  readonly preview: ReadonlyArray<readonly [number, number]>;
  readonly onPress: (x: number, y: number) => void;
  readonly onEnter: (x: number, y: number) => void;
  readonly onLeave: () => void;
}) => (
  <div
    role="grid"
    aria-label="Canvas"
    className="grid aspect-square w-full max-w-[min(512px,60dvh)] touch-none border border-neutral-700 select-none"
    style={{ gridTemplateColumns: `repeat(${grid.length}, 1fr)` }}
    onPointerLeave={onLeave}
  >
    {grid.flatMap((row, y) =>
      row.map((cell, x) => (
        <div
          key={`${x},${y}`}
          role="gridcell"
          aria-label={`Cell ${x + 1}, ${y + 1}`}
          className={
            preview.some(([px, py]) => px === x && py === y)
              ? 'outline-2 -outline-offset-2 outline-sky-400'
              : undefined
          }
          style={{
            backgroundColor: cell === null ? empty : (colors[cell] ?? empty),
          }}
          onPointerDown={(event) => {
            event.preventDefault();
            onPress(x, y);
          }}
          onPointerEnter={() => onEnter(x, y)}
        />
      )),
    )}
  </div>
);
