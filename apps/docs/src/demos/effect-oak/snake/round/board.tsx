import type { Body, Position } from './body.js';
import { contains, GRID, same } from './body.js';

const cellClass = (body: Body, apple: Position, cell: Position) =>
  same(body[0], cell)
    ? 'bg-green-700'
    : contains(body, cell)
      ? 'bg-green-500'
      : same(apple, cell)
        ? 'bg-red-500'
        : 'bg-neutral-800';

/** The grid, one cell per square: the snake, the apple, and empty ground. */
export const Board = ({
  snake,
  apple,
}: {
  readonly snake: Body;
  readonly apple: Position;
}) => (
  <div
    role="img"
    aria-label="The snake and the apple on a grid"
    className="grid aspect-square w-full max-w-[min(480px,50dvh)] border-2 border-neutral-600"
    style={{ gridTemplateColumns: `repeat(${GRID}, 1fr)` }}
  >
    {Array.from({ length: GRID * GRID }, (_, index) => {
      const cell = { x: index % GRID, y: Math.floor(index / GRID) };
      return <div key={index} className={cellClass(snake, apple, cell)} />;
    })}
  </div>
);
