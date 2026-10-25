import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';

/*
 * A Draft Mode: one way the Draft is written, a Child of the Draft for
 * each mode it has. Each keeps its own text, cursor and selection, so
 * switching away and back finds it as it was left.
 *
 * 1. Modes   a Message, sent to the Session, with files and Skills; a
 *            Side Question, text only, asked of the Session on the side.
 *            A new session's Draft has only a Message: there is no
 *            Session to ask yet.
 * 2. Write   the editor reports each edit and each move of the cursor;
 *            the mode keeps them as written.
 * 3. Reset   the Draft sets a mode's text when it must: cleared once
 *            sent, brought back when refused, carried over from `/btw`.
 *            Each reset is numbered, and the mode takes each once.
 */

// 1. Modes
export const Mode = Schema.Literals(['Message', 'SideQuestion']);
export type Mode = typeof Mode.Type;

/** The modes a Draft has: a Side Question only where there is a Session to ask. */
export const modesOf = (session: boolean): ReadonlyArray<Mode> =>
  session ? ['Message', 'SideQuestion'] : ['Message'];

/** The mode a Child's key names. */
export const modeOf = (key: string): Mode =>
  key === 'SideQuestion' ? 'SideQuestion' : 'Message';

/** What a mode takes besides text: files and Skills go only with a Message. */
export const takes = (mode: Mode) => ({
  files: mode === 'Message',
  skills: mode === 'Message',
  /** The model Picker: a Side Question is answered by the Session's own. */
  picks: mode === 'Message',
});

/** A mode's text, and its cursor or selection, from `anchor` to `head`. */
export const Written = Schema.Struct({
  text: Schema.String,
  anchor: Schema.Finite,
  head: Schema.Finite,
});
export type Written = typeof Written.Type;

export const blank: Written = { text: '', anchor: 0, head: 0 };

/** `text` with the cursor at its end. */
export const writtenOf = (text: string): Written => ({
  text,
  anchor: text.length,
  head: text.length,
});

/** Text the Draft sets a mode to, numbered so it is taken once. */
export const Reset = Schema.Struct({ id: Schema.Finite, ...Written.fields });

const DraftMode = Actor.define('DraftMode', {
  /** What it starts from, and the last reset that holds already. */
  input: Schema.Struct({ ...Written.fields, reset: Schema.Finite }),
  props: Schema.Struct({ mode: Mode, reset: Schema.NullOr(Reset) }),
  model: Schema.Struct({
    written: Written,
    /** The last reset taken. */
    reset: Schema.Finite,
  }),
  message: Schema.TaggedUnion({
    Edited: Written.fields,
    ResetTaken: {},
  }),
});

export const DraftModeLive = Actor.build(DraftMode, {
  init: ({ reset, ...written }) => ({ model: { written, reset } }),
  on: {
    // 2. Write
    Edited: ({ text, anchor, head }, { model }) => ({
      model: { ...model, written: { text, anchor, head } },
    }),
    // 3. Reset
    ResetTaken: (_, { model, props }) =>
      props.reset === null || props.reset.id <= model.reset
        ? {}
        : {
            model: {
              written: {
                text: props.reset.text,
                anchor: props.reset.anchor,
                head: props.reset.head,
              },
              reset: props.reset.id,
            },
          },
  },
});
