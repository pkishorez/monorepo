import { Thumbnail } from './thumbnail.js';

type Grid = ReadonlyArray<ReadonlyArray<number | null>>;

const VISIBLE = 6;

/**
 * The most recent undo steps, newest first, then the redo steps: click one
 * to go back or forward to it.
 */
export const History = ({
  undo,
  redo,
  colors,
  empty,
  onUndoTo,
  onRedoTo,
}: {
  readonly undo: ReadonlyArray<Grid>;
  readonly redo: ReadonlyArray<Grid>;
  readonly colors: ReadonlyArray<string>;
  readonly empty: string;
  readonly onUndoTo: (index: number) => void;
  readonly onRedoTo: (index: number) => void;
}) => {
  const steps = (
    stack: ReadonlyArray<Grid>,
    label: string,
    go: (index: number) => void,
  ) =>
    stack
      .map((grid, index) => ({ grid, index }))
      .slice(-VISIBLE)
      .reverse()
      .map(({ grid, index }) => (
        <button
          key={`${label}-${index}`}
          type="button"
          aria-label={`${label} step ${index + 1}`}
          className="rounded hover:ring-2 hover:ring-sky-400"
          onClick={() => go(index)}
        >
          <Thumbnail grid={grid} colors={colors} empty={empty} />
        </button>
      ));
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">
        History ({undo.length} undo, {redo.length} redo)
      </p>
      <div className="flex flex-wrap gap-1">
        {steps(undo, 'Undo', onUndoTo)}
      </div>
      {redo.length > 0 && (
        <div className="flex flex-wrap gap-1 opacity-60">
          {steps(redo, 'Redo', onRedoTo)}
        </div>
      )}
    </div>
  );
};
