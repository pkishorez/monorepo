import { Schema } from 'effect';
import { AttachmentSchema } from '@kestack/connect/code';
import { createContext, type ReactNode } from 'react';

/*
 * What a Draft holds that is sent: its files, and the Inserts put into it;
 * and what the page that holds it adds to its foot (`Slots`). Its parts,
 * `write/`, `pick/` and `send/`, read these too.
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

/** What the page that holds the Draft adds to its foot. */
export const Slots = createContext<{
  /** Beside the send button, such as Stop. */
  readonly actions?: ReactNode;
  /** The page's own problem, shown where the Draft's would be. */
  readonly problem?: string | null;
  /** Nothing can be sent, as the page says above it, such as in a Project whose folder is missing. */
  readonly blocked?: boolean;
  /** Where Side Question mode is drawn, in place of the transcript. */
  readonly sideQuestion?: HTMLElement | null;
  /** Where a new session's branch and New Worktree switch are drawn, over the Draft. */
  readonly where?: HTMLElement | null;
}>({});
