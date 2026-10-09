import { Context, Effect, Schema } from 'effect';
import { Node } from 'effect-oak';

/*
 * The Export button as a Node: Idle, Exporting, or Failed with the error
 * shown in a dialog. Exporting reads the picture from the Printable Service
 * in a Command, draws it on a canvas four times larger and downloads it.
 */

/** The picture as it is now, ready to print: rows of colors. */
export class Printable extends Context.Service<
  Printable,
  { readonly colors: ReadonlyArray<ReadonlyArray<string>> }
>()('docs/pixel-art/Printable') {}

const SIZE_PX = 512;
const SCALE = 4;

const exportPng = Effect.gen(function* () {
  const { colors } = yield* Printable;
  const size = colors.length;
  const cell = Math.max(1, Math.floor(SIZE_PX / size)) * SCALE;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size * cell;
  const context = canvas.getContext('2d');
  if (!context)
    return {
      _tag: 'FailedExport' as const,
      error: 'Canvas 2D context not available',
    };
  colors.forEach((row, y) =>
    row.forEach((color, x) => {
      context.fillStyle = color;
      context.fillRect(x * cell, y * cell, cell, cell);
    }),
  );
  const link = document.createElement('a');
  link.download = 'pixel-art.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
  return { _tag: 'SucceededExport' as const };
});

export const Export = Node.make('Export', {
  requires: { printable: Printable },
  state: Schema.TaggedUnion({
    Idle: {},
    Exporting: {},
    Failed: { error: Schema.String },
  }),
  message: Schema.TaggedUnion({
    ClickedExport: {},
    SucceededExport: {},
    FailedExport: { error: Schema.String },
    DismissedError: {},
  }),
}).build({
  init: () => ({ state: { _tag: 'Idle' } }),
  update: {
    Idle: {
      ClickedExport: () => ({
        state: { _tag: 'Exporting' },
        commands: [exportPng],
      }),
    },
    Exporting: {
      SucceededExport: () => ({ state: { _tag: 'Idle' } }),
      FailedExport: ({ error }) => ({ state: { _tag: 'Failed', error } }),
    },
    Failed: {
      DismissedError: () => ({ state: { _tag: 'Idle' } }),
    },
  },
});
