import { describe, expect, it } from "vitest";
import { Grid } from "../game";

describe("Grid", () => {
  it("should create a grid with the given number of rows and columns", () => {
    const grid = new Grid({
      rows: 3,
      columns: 3,

      cells: {
        size: 100,
      },

      orbRadius: 10,
      players: 2,
    });

    expect(grid.cells.map((v) => v.id)).toEqual(
      [
        [0, 1, 2],
        [3, 4, 5],
        [6, 7, 8],
      ].flat(),
    );

    expect(grid.getCellNeighbours(0).map((cell) => cell.id)).toEqual([1, 3]);
    expect(grid.getCellNeighbours(1).map((cell) => cell.id)).toEqual([0, 2, 4]);
    expect(grid.getCellNeighbours(2).map((cell) => cell.id)).toEqual([1, 5]);
    expect(grid.getCellNeighbours(3).map((cell) => cell.id)).toEqual([0, 4, 6]);
    expect(grid.getCellNeighbours(4).map((cell) => cell.id)).toEqual([
      1, 3, 5, 7,
    ]);
    expect(grid.getCellNeighbours(5).map((cell) => cell.id)).toEqual([2, 4, 8]);
    expect(grid.getCellNeighbours(6).map((cell) => cell.id)).toEqual([3, 7]);
    expect(grid.getCellNeighbours(7).map((cell) => cell.id)).toEqual([4, 6, 8]);
    expect(grid.getCellNeighbours(8).map((cell) => cell.id)).toEqual([5, 7]);
  });
});
