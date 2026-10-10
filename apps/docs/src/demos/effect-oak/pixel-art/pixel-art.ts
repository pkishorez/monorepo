import { Effect, Layer, Schema } from 'effect';
import { Actor } from 'effect-oak';
import { Export, Printable } from './export/index.js';
import {
  DEFAULT_SIZE,
  emptyGrid,
  fill,
  Grid,
  isEmpty,
  mirrored,
  paint,
  remember,
} from './grid.js';
import { colorsOf, EMPTY } from './palette.js';
import { PictureStore, Saved } from './store.js';
import { Brush, Mirror, Tool, Tools } from './tools/index.js';

/*
 * The pixel art editor: Loading → Ready.
 *
 * Loading reads the saved picture in a Lifetime, so it arrives as a Message
 * and Replay sees it. Ready keeps the picture, its undo and redo stacks, the
 * palette, and a copy of the tools: the Tools Child owns which tool is in
 * hand and tells the editor through the Brush Request. The Export Child
 * reads the picture from Printable when asked. Every finished change is
 * saved by a Command.
 */

const Cell = { x: Schema.Number, y: Schema.Number };
const Position = Schema.Struct(Cell);

const Ready = {
  grid: Grid,
  size: Schema.Number,
  undo: Schema.Array(Grid),
  redo: Schema.Array(Grid),
  theme: Schema.Number,
  color: Schema.Number,
  tool: Tool,
  mirror: Mirror,
  /** A stroke is under way: entering a cell paints it. */
  drawing: Schema.Boolean,
  hovered: Schema.NullOr(Position),
  /** A new size waiting for the user to confirm that the picture is lost. */
  pendingSize: Schema.NullOr(Schema.Number),
};
type Ready = Schema.Struct<typeof Ready>['Type'];

const save = (ready: Ready) =>
  Effect.gen(function* () {
    yield* (yield* PictureStore).save({
      grid: ready.grid,
      size: ready.size,
      theme: ready.theme,
      color: ready.color,
    });
    return { _tag: 'SucceededSave' as const };
  }).pipe(Effect.orElseSucceed(() => ({ _tag: 'FailedSave' as const })));

/** Keep the new Ready, and save it. */
const saved = (ready: Ready) => ({
  state: { ...ready, _tag: 'Ready' as const },
  command: save(ready),
});

/** A new picture: the old one goes on the undo stack, and redo is forgotten. */
const changed = (ready: Ready, grid: Grid): Ready => ({
  ...ready,
  grid,
  undo: remember(ready.undo, ready.grid),
  redo: [],
});

/** What the brush or eraser does to the cell at `x, y`. */
const stroke = (ready: Ready, x: number, y: number) =>
  paint(
    ready.grid,
    mirrored(x, y, ready.size, ready.mirror),
    ready.tool === 'Eraser' ? null : ready.color,
  );

const resized = (ready: Ready, size: number): Ready => ({
  ...ready,
  grid: emptyGrid(size),
  size,
  undo: [],
  redo: [],
  drawing: false,
  hovered: null,
  pendingSize: null,
});

const opened = (saved: Saved | null): Ready => ({
  grid: saved?.grid ?? emptyGrid(DEFAULT_SIZE),
  size: saved?.size ?? DEFAULT_SIZE,
  undo: [],
  redo: [],
  theme: saved?.theme ?? 0,
  color: saved?.color ?? 0,
  tool: 'Brush',
  mirror: 'None',
  drawing: false,
  hovered: null,
  pendingSize: null,
});

export const PixelArt = Actor.make('PixelArt', {
  requires: { store: PictureStore },
  state: Schema.TaggedUnion({ Loading: {}, Ready }),
  message: Schema.TaggedUnion({
    Loaded: { saved: Schema.NullOr(Saved) },
    PressedCell: Cell,
    EnteredCell: Cell,
    LeftCanvas: {},
    ReleasedPointer: {},
    SelectedColor: { color: Schema.Number },
    SelectedTheme: { theme: Schema.Number },
    ChangedBrush: { tool: Tool, mirror: Mirror },
    ClickedUndo: {},
    ClickedRedo: {},
    ClickedHistoryStep: { index: Schema.Number },
    ClickedRedoStep: { index: Schema.Number },
    ClickedClear: {},
    SelectedSize: { size: Schema.Number },
    ConfirmedResize: {},
    CancelledResize: {},
    SucceededSave: {},
    FailedSave: {},
  }),
  provides: { Ready: [Brush, Printable] },
  children: { Ready: { tools: Tools, export: Export } },
}).build({
  init: () => ({ state: { _tag: 'Loading' } }),
  lifetime: {
    Loading: (self) =>
      Effect.gen(function* () {
        const saved = yield* (yield* PictureStore).load;
        yield* self.send({ _tag: 'Loaded', saved });
      }),
  },
  provides: {
    Ready: (self) =>
      Layer.mergeAll(
        Layer.succeed(Brush, {
          changed: (tool, mirror) =>
            self.send({ _tag: 'ChangedBrush', tool, mirror }),
        }),
        Layer.succeed(Printable, {
          colors: self.get.pipe(
            Effect.map(({ state }) => {
              const colors = colorsOf(state.theme);
              return state.grid.map((row) =>
                row.map((cell) =>
                  cell === null ? EMPTY : (colors[cell] ?? EMPTY),
                ),
              );
            }),
          ),
        }),
      ),
  },
  update: {
    Loading: {
      Loaded: ({ saved }) => ({ state: { _tag: 'Ready', ...opened(saved) } }),
    },
    Ready: {
      PressedCell: ({ x, y }, { state }) =>
        state.tool === 'Fill'
          ? saved(changed(state, fill(state.grid, x, y, state.color)))
          : {
              state: {
                ...changed(state, stroke(state, x, y)),
                _tag: 'Ready',
                drawing: true,
              },
            },
      EnteredCell: ({ x, y }, { state }) => ({
        state: {
          ...state,
          hovered: { x, y },
          grid: state.drawing ? stroke(state, x, y) : state.grid,
        },
      }),
      LeftCanvas: (_, { state }) => ({ state: { ...state, hovered: null } }),
      ReleasedPointer: (_, { state }) =>
        state.drawing ? saved({ ...state, drawing: false }) : {},
      SelectedColor: ({ color }, { state }) => saved({ ...state, color }),
      SelectedTheme: ({ theme }, { state }) =>
        saved({ ...state, theme, color: 0 }),
      ChangedBrush: ({ tool, mirror }, { state }) => ({
        state: { ...state, tool, mirror },
      }),
      ClickedUndo: (_, { state }) => {
        const previous = state.undo.at(-1);
        if (!previous) return {};
        return saved({
          ...state,
          grid: previous,
          undo: state.undo.slice(0, -1),
          redo: [...state.redo, state.grid],
        });
      },
      ClickedRedo: (_, { state }) => {
        const next = state.redo.at(-1);
        if (!next) return {};
        return saved({
          ...state,
          grid: next,
          undo: [...state.undo, state.grid],
          redo: state.redo.slice(0, -1),
        });
      },
      ClickedHistoryStep: ({ index }, { state }) => {
        const target = state.undo[index];
        if (!target) return {};
        return saved({
          ...state,
          grid: target,
          undo: state.undo.slice(0, index),
          redo: [
            ...state.redo,
            state.grid,
            ...state.undo.slice(index + 1).reverse(),
          ],
        });
      },
      ClickedRedoStep: ({ index }, { state }) => {
        const target = state.redo[index];
        if (!target) return {};
        return saved({
          ...state,
          grid: target,
          undo: [
            ...state.undo,
            state.grid,
            ...state.redo.slice(index + 1).reverse(),
          ],
          redo: state.redo.slice(0, index),
        });
      },
      ClickedClear: (_, { state }) =>
        saved(changed(state, emptyGrid(state.size))),
      SelectedSize: ({ size }, { state }) =>
        size === state.size
          ? {}
          : isEmpty(state.grid)
            ? saved(resized(state, size))
            : { state: { ...state, pendingSize: size } },
      ConfirmedResize: (_, { state }) =>
        state.pendingSize === null
          ? {}
          : saved(resized(state, state.pendingSize)),
      CancelledResize: (_, { state }) => ({
        state: { ...state, pendingSize: null },
      }),
    },
  },
});

export { PictureStoreLive } from './store.js';
