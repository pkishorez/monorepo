import { range } from "lodash-es";
import invariant from "tiny-invariant";

interface Config {
  rows: number;
  columns: number;
  cells: {
    size: number;
  };
  orbRadius: number;
  players: number;
}

export class Game {
  grid: Grid;
  players: number;
  currentPlayer: number = 0;

  constructor(config: Config) {
    this.grid = new Grid(config);
    this.players = config.players;
    invariant(this.players > 1, "There should be at least 2 players");
  }

  getCells() {
    return this.grid.cells;
  }

  addOrbToCell(cellId: number) {
    this.grid.addOrbToCell(cellId);
  }

  areCellsAtCriticalMass() {
    return this.grid.areCellsAtCriticalMass();
  }

  explodeCells() {
    this.grid.explodeCells();
  }
}

export class Grid {
  private rows: number;
  private columns: number;

  cells: Cell[];

  constructor({ rows, columns, cells }: Config) {
    this.rows = rows;
    this.columns = columns;

    this.cells = range(this.rows).flatMap((row) =>
      range(this.columns).map(
        (column) =>
          new Cell({
            id: row * this.rows + column,
            size: cells.size,
            x: column * cells.size + cells.size / 2,
            y: row * cells.size + cells.size / 2,
          }),
      ),
    );
    this.cells.forEach((cell) => {
      cell.setNeighbours(this.getCellNeighbours(cell.id));
    });
  }

  addOrbToCell(cellId: number) {
    const cell = this.cells.find((cell) => cell.id === cellId);
    invariant(cell, `Cell ${cellId} not found`);

    cell.createOrb();
  }

  areCellsAtCriticalMass() {
    return this.cells.some((cell) => cell.isAtCriticalMass);
  }

  explodeCells() {
    this.cells.forEach((cell) => {
      if (cell.isAtCriticalMass) {
        cell.explode();
      }
    });
  }

  getCellNeighbours(cellId: number): Cell[] {
    const cell = this.cells.find((cell) => cell.id === cellId);

    if (!cell) {
      throw new Error(`Cell ${cellId} not found`);
    }

    const neighbours = this.cells.filter((cell) => {
      const row = Math.floor(cell.id / this.rows);
      const column = cell.id % this.columns;

      const cellRow = Math.floor(cellId / this.rows);
      const cellColumn = cellId % this.columns;

      return (
        (row === cellRow - 1 && column === cellColumn) ||
        (row === cellRow + 1 && column === cellColumn) ||
        (row === cellRow && column === cellColumn - 1) ||
        (row === cellRow && column === cellColumn + 1)
      );
    });

    return neighbours;
  }
}

class Cell {
  readonly id: number;
  private size: number;

  private pos: { x: number; y: number } = { x: 0, y: 0 };
  private neighbourCells: Cell[] = [];

  playerId: number = -1;

  private orbs: Orb[] = [];

  get x() {
    return this.pos.x;
  }
  get y() {
    return this.pos.y;
  }

  constructor({
    id,
    size: size,
    x,
    y,
  }: {
    id: number;
    size: number;
    x: number;
    y: number;
  }) {
    this.id = id;
    this.size = size;

    this.pos.x = x;
    this.pos.y = y;
  }

  getOrbs() {
    return this.orbs;
  }

  createOrb() {
    const orb = new Orb();
    this.orbs.push(orb);
    this.repositionOrbs();
  }

  private repositionOrbs() {
    const radius = this.orbs.length === 1 ? 0 : this.size / 3;

    this.orbs.forEach((orb, i) => {
      const posX =
        this.pos.x +
        (Math.cos((Math.PI * 2 * i) / this.orbs.length) * radius) / 2;
      const posY =
        this.pos.y +
        (Math.sin((Math.PI * 2 * i) / this.orbs.length) * radius) / 2;

      orb.setPosition({ x: posX, y: posY });
    });
  }

  addOrb(orb: Orb) {
    this.orbs.push(orb);
    this.repositionOrbs();
  }

  setPlayerId(playerId: number) {
    this.playerId = playerId;
  }

  get isAtCriticalMass() {
    return this.orbs.length >= this.neighbourCells.length;
  }

  explode() {
    invariant(this.isAtCriticalMass, "The cell is not at critical mass");

    this.neighbourCells.forEach((cell) => {
      const orb = this.orbs.pop();
      invariant(!!orb, "The orb should be present. This is impossible state.");

      cell.addOrb(orb);
      cell.setPlayerId(this.playerId);
    });
  }

  setNeighbours(neighbours: Cell[]) {
    this.neighbourCells = neighbours;
  }
}

interface OrbConfig {
  from: { x: number; y: number; scale: number };
  to: { x: number; y: number; scale: number };
  animate: "move" | "fly";
}
class Orb {
  config: OrbConfig;
  constructor(config: OrbConfig) {
    this.config = config;
  }

  updateConfig(config: OrbConfig) {
    this.config = config;
  }

  lerp(t: number) {
    const value = {
      x: this.config.from.x,
      y: this.config.from.y,
      z: 0,
      scale:
        this.config.from.scale +
        (this.config.to.scale - this.config.from.scale) * t,
    };

    value.x += (this.config.to.x - this.config.from.x) * t;
    value.y += (this.config.to.y - this.config.from.y) * t;
  }
}
