import { Schema } from 'effect';
import { AttachmentSchema } from '@kestack/connect/code';

/*
 * What a Draft holds that is sent: its files, and the Inserts put into it.
 */

/** A file on a message being written: what is sent, and its size to show. */
export const Attached = Schema.Struct({
  ...AttachmentSchema.fields,
  size: Schema.Finite,
});

/** Files as they are sent: without the sizes only the Draft shows. */
export const wire = (attached: ReadonlyArray<typeof Attached.Type>) =>
  attached.map(({ name, mime, data }) => ({ name, mime, data }));

/** What goes into the Draft: text, or a Skill, on a `/` typed there or not. */
const What = Schema.TaggedUnion({
  Text: { text: Schema.String },
  Skill: { name: Schema.String, typed: Schema.Boolean },
});

/**
 * The last thing put into the Draft, for its editor to put in at its
 * cursor; `id` counts them, so each goes in once.
 */
export const Insert = {
  Schema: Schema.Struct({ id: Schema.Finite, what: What }),
  What,
  /** The Insert after `last`, of `what`. */
  next: (
    last: { readonly id: number } | null,
    what: typeof What.Type,
  ): { readonly id: number; readonly what: typeof What.Type } => ({
    id: (last?.id ?? 0) + 1,
    what,
  }),
};
