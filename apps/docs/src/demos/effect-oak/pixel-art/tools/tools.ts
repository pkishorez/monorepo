import { Context, Effect, Schema } from 'effect';
import { Node } from 'effect-oak';

/*
 * The tool panel as a Node: which tool is in hand, and which mirrors are on.
 * It tells whoever Provides Brush every time either changes, a Request, so
 * the picture paints with the right tool without reading its Children.
 */

export const Tool = Schema.Literals(['Brush', 'Fill', 'Eraser']);
export type Tool = typeof Tool.Type;

export const Mirror = Schema.Literals([
  'None',
  'Horizontal',
  'Vertical',
  'Both',
]);
export type Mirror = typeof Mirror.Type;

/** Whoever paints: the picture. */
export class Brush extends Context.Service<
  Brush,
  { readonly changed: (tool: Tool, mirror: Mirror) => void }
>()('docs/pixel-art/Brush') {}

const FLIP: Readonly<
  Record<'Horizontal' | 'Vertical', Readonly<Record<Mirror, Mirror>>>
> = {
  Horizontal: {
    None: 'Horizontal',
    Horizontal: 'None',
    Vertical: 'Both',
    Both: 'Vertical',
  },
  Vertical: {
    None: 'Vertical',
    Vertical: 'None',
    Horizontal: 'Both',
    Both: 'Horizontal',
  },
};

type Model = { readonly tool: Tool; readonly mirror: Mirror };

/** Keep the new tools, and tell the Brush. */
const changed = (model: Model) => ({
  model,
  commands: [
    Effect.gen(function* () {
      (yield* Brush).changed(model.tool, model.mirror);
    }),
  ],
});

export const Tools = Node.make('Tools', {
  requires: { brush: Brush },
  model: Schema.Struct({ tool: Tool, mirror: Mirror }),
  message: Schema.TaggedUnion({
    SelectedTool: { tool: Tool },
    ToggledMirror: { axis: Schema.Literals(['Horizontal', 'Vertical']) },
  }),
}).build({
  init: () => ({ model: { tool: 'Brush', mirror: 'None' } }),
  update: {
    SelectedTool: ({ tool }, { model }) =>
      tool === model.tool ? {} : changed({ ...model, tool }),
    ToggledMirror: ({ axis }, { model }) =>
      changed({ ...model, mirror: FLIP[axis][model.mirror] }),
  },
});
