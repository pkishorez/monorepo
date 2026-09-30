import { useState } from 'react';
import {
  type Board,
  BOARDS,
  COLUMNS,
  type ColumnId,
  incoming,
  type Task,
} from './data.ts';

const where = (board: Board, id: string) => {
  for (const { id: column } of COLUMNS) {
    const index = board.columns[column].findIndex((task) => task.id === id);
    if (index !== -1) return { column, index };
  }
  return undefined;
};

/**
 * `board` with the task `id` at `index` of `column`, counted without it; the
 * same board when it is there already, so nothing re-renders.
 */
const placed = (board: Board, id: string, column: ColumnId, index: number) => {
  const from = where(board, id);
  if (from === undefined) return board;
  if (from.column === column && from.index === index) return board;
  const task = board.columns[from.column][from.index] as Task;
  const columns = { ...board.columns };
  columns[from.column] = columns[from.column].filter((t) => t.id !== id);
  const into = [...columns[column]];
  into.splice(index, 0, task);
  columns[column] = into;
  return { ...board, columns };
};

/** Every board, the one on screen, and the ways its tasks move. */
export function useBoards() {
  const [boards, setBoards] = useState(BOARDS);
  const [currentId, setCurrentId] = useState(BOARDS[0]?.id);
  const board = boards.find((b) => b.id === currentId) ?? (BOARDS[0] as Board);

  const update = (change: (board: Board) => Board) =>
    setBoards((all) => {
      const before = all.find((b) => b.id === board.id);
      if (before === undefined) return all;
      const after = change(before);
      return after === before
        ? all
        : all.map((b) => (b === before ? after : b));
    });

  return {
    boards,
    board,
    select: setCurrentId,
    /** The column `step` columns over from the task's, if there is one. */
    neighbour: (id: string, step: 1 | -1): ColumnId | undefined => {
      const from = where(board, id);
      if (from === undefined) return undefined;
      const at = COLUMNS.findIndex((c) => c.id === from.column) + step;
      return COLUMNS[at]?.id;
    },
    /** Puts a task at `index` of `column`, counted without it. */
    place: (id: string, column: ColumnId, index: number) =>
      update((b) => placed(b, id, column, index)),
    /** A teammate's new task, at the top of `column`. */
    refresh: (column: ColumnId) =>
      update((b) => ({
        ...b,
        columns: { ...b.columns, [column]: [incoming(), ...b.columns[column]] },
      })),
  };
}

export type Boards = ReturnType<typeof useBoards>;
