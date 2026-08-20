import { Schema } from 'effect';
import { EntityESchema, ESchema } from 'std-toolkit/eschema';

/**
 * The notebook's Note, at every version it has ever had.
 *
 * - v1 a note has a body and a colour
 * - v2 notes can be pinned
 * - v3 colour is dropped
 * - v4 `body` is renamed to `text`
 *
 * The Stories in "Defining evolutions" build this ladder one rung at a time.
 * Every later Story starts from the finished ladder below.
 */
export const Note = ESchema.make('Note', {
  body: Schema.String,
  colour: Schema.String,
})
  .evolve('v2', { pinned: Schema.Boolean }, (previous) => ({
    ...previous,
    pinned: false,
  }))
  .evolve('v3', { colour: null }, ({ colour: _colour, ...rest }) => rest)
  .evolve('v4', { body: null, text: Schema.String }, ({ body, ...rest }) => ({
    ...rest,
    text: body,
  }))
  .build();

export const NoteEntity = EntityESchema.make('Note', 'noteId', {
  notebook: Schema.String,
  text: Schema.String,
  pinned: Schema.Boolean,
}).build();

export const sameShape = (left: object, right: object): boolean =>
  JSON.stringify(left) === JSON.stringify(right);
