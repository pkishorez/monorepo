import { Schema } from 'effect';
import { Node } from 'effect-oak';

/*
 * A pattern designer built on two custom elements: a color picker whose
 * events become Messages, and a badge drawn from the Model.
 *
 * One Node: the preview needs the text and both colors, and a parent can
 * neither read its Children's Models nor hand them data, so each color
 * field as its own Node would only mirror the root's Model.
 */

export const WebComponents = Node.make('WebComponents', {
  model: Schema.Struct({
    content: Schema.String,
    fill: Schema.String,
    background: Schema.String,
  }),
  message: Schema.TaggedUnion({
    UpdatedContent: { value: Schema.String },
    ChangedFillColor: { value: Schema.String },
    ChangedBackgroundColor: { value: Schema.String },
  }),
}).build({
  init: () => ({
    model: {
      content: 'https://foldkit.dev',
      fill: '#1e1b4b',
      background: '#fef3c7',
    },
  }),
  update: {
    UpdatedContent: ({ value }, { model }) => ({
      model: { ...model, content: value },
    }),
    ChangedFillColor: ({ value }, { model }) => ({
      model: { ...model, fill: value },
    }),
    ChangedBackgroundColor: ({ value }, { model }) => ({
      model: { ...model, background: value },
    }),
  },
});
