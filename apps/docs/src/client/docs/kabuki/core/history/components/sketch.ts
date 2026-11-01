import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';

export const Colour = Schema.Literals(['ink', 'rose', 'amber', 'sky']);

export const Sketch = Actor.define('Sketch', {
  model: Schema.Struct({
    colour: Colour,
    cells: Schema.Array(Schema.NullOr(Colour)),
  }),
  message: Schema.TaggedUnion({
    Picked: { colour: Colour },
    Painted: { cell: Schema.Number },
  }),
});

export const SketchLive = Sketch.build({
  init: () => ({
    model: { colour: 'ink', cells: Array.from({ length: 25 }, () => null) },
  }),
  on: {
    Picked: ({ colour }, { model }) => ({ model: { ...model, colour } }),
    // Painting a cell its own colour again wipes it.
    Painted: ({ cell }, { model }) => ({
      model: {
        ...model,
        cells: model.cells.map((now, at) =>
          at !== cell ? now : now === model.colour ? null : model.colour,
        ),
      },
    }),
  },
});
