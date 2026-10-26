import { Context, Effect, Layer, Schema, Stream } from 'effect';
import { Actor, Command } from '@kestack/kabuki';
import { Written } from '../../../../../connection/store/index.ts';
import { TouchDraft } from './touch/index.ts';

/*
 * A Draft Mode: one way the Draft is written, a Child of the Draft for
 * each mode it has. Each is the one owner of its text, cursor and
 * selection, so switching away and back finds it as it was left; the
 * Draft sees them only as the mode shows them to it, through the `Owner`
 * it Provides.
 *
 * 1. Modes   a Message, sent to the Session, with files and Skills; a
 *            Side Question, text only, asked of the Session on the side.
 *            A new session's Draft has only a Message: there is no
 *            Session to ask yet.
 * 2. Write   its View draws the Draft's card from its text
 *            (`write.tsx`), its files (`attachments/`) under it, and the
 *            editor (`editor/`) reports each edit and each move of the
 *            cursor; each
 *            is shown to the Draft, which keeps it in its Saved Draft.
 *            Text the Draft gives back, a refused send's, it takes once.
 * 3. Send    its text goes up to the Draft, to send or ask. In a Session
 *            it empties at once. On a device with no keyboard it holds
 *            the Touch Draft, which has it sent the same way.
 */

// 1. Modes
export const Mode = Schema.Literals(['Message', 'SideQuestion']);
export type Mode = typeof Mode.Type;

/** The modes a Draft has: a Side Question only where there is a Session to ask. */
export const modesOf = (session: boolean): ReadonlyArray<Mode> =>
  session ? ['Message', 'SideQuestion'] : ['Message'];

/** What a mode takes besides text: files and Skills go only with a Message. */
export const takes = (mode: Mode) => ({
  files: mode === 'Message',
  skills: mode === 'Message',
  /** The model Picker: a Side Question is answered by the Session's own. */
  picks: mode === 'Message',
});

export const blank: Written = { text: '', anchor: 0, head: 0 };

/** `text` with the cursor at its end. */
export const writtenOf = (text: string): Written => ({
  text,
  anchor: text.length,
  head: text.length,
});

/** What a Draft Mode asks of its owner, the Draft. */
export class Owner extends Context.Service<
  Owner,
  {
    /** Shows the Draft each text and selection the mode holds, for as long as it lives. */
    readonly shows: (
      mode: Mode,
      written: Stream.Stream<Written>,
    ) => Effect.Effect<void>;
    /** Sends the mode's text, or asks it. */
    readonly send: (mode: Mode, text: string) => Effect.Effect<void>;
  }
>()('code/DraftMode/Owner') {}

/** The Layer the Draft Provides: what each mode hands it. */
export const owner = <R>(given: Effect.Effect<Owner['Service'], never, R>) =>
  Layer.effect(Owner, given);

const sendUp = Command.make('DraftModeSends', {
  args: Schema.Struct({ mode: Mode, text: Schema.String }),
  run: ({ mode, text }) =>
    Effect.flatMap(Owner, (owner) => owner.send(mode, text)),
});

/** Text the Draft gives a mode, once: before what it holds, or in place of it. */
export const Given = Schema.Struct({
  id: Schema.Finite,
  text: Schema.String,
  replaces: Schema.Boolean,
});

const Props = Schema.Struct({
  mode: Mode,
  /** A send empties it at once: a Session's. */
  clears: Schema.Boolean,
  given: Schema.NullOr(Given),
});

const Model = Schema.Struct({
  written: Written,
  /** The last text given it that it took. */
  took: Schema.Finite,
});

const DraftMode = Actor.define('DraftMode', {
  requires: [Owner],
  /** What it starts from. */
  input: Written,
  props: Props,
  model: Model,
  message: Schema.TaggedUnion({
    Edited: Written.fields,
    SendAsked: {},
    Took: { given: Given },
  }),
});

export const DraftModeLive = Actor.build(DraftMode, {
  init: (written) => ({ model: { written, took: 0 } }),
  // 3. Send: on touch, through the Touch Draft.
  provides: (self) => TouchDraft.owner(self.send({ _tag: 'SendAsked' })),
  children: { touch: { actor: TouchDraft.actor } },
  workers: {
    // 2. Write
    shows: {
      run: (self) =>
        Effect.gen(function* () {
          const { props } = yield* self.get;
          const owner = yield* Owner;
          yield* owner.shows(
            props.mode,
            Stream.map(self.changes, ({ model }) => model.written),
          );
        }),
    },
    takes: {
      each: ({ model, props }) =>
        props.given !== null && props.given.id > model.took
          ? [String(props.given.id)]
          : [],
      run: (self) =>
        Effect.gen(function* () {
          const { props } = yield* self.get;
          if (props.given !== null)
            yield* self.send({ _tag: 'Took', given: props.given });
        }),
    },
  },
  on: {
    // 2. Write
    Edited: ({ text, anchor, head }, { model }) => ({
      model: { ...model, written: { text, anchor, head } },
    }),
    Took: ({ given }, { model }) => {
      if (given.id <= model.took) return {};
      const now = model.written.text;
      const text =
        given.replaces || now === '' ? given.text : `${given.text}\n\n${now}`;
      return { model: { written: writtenOf(text), took: given.id } };
    },
    // 3. Send
    SendAsked: (_, { model, props }) => ({
      ...(props.clears ? { model: { ...model, written: blank } } : {}),
      command: sendUp({ mode: props.mode, text: model.written.text }),
    }),
  },
});
