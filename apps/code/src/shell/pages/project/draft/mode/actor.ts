import { Context, Effect, Layer, Schema } from 'effect';
import { Actor, Command } from '@kestack/kabuki';
import { Written } from '../../../../../layer/capabilities/index.ts';
import { TouchDraft } from './touch/index.ts';
import { btwQuestion } from './btw.ts';
import { keeping } from './keep.ts';

/*
 * A Draft Mode: one way the Draft is written, a Child of the Draft for
 * each mode it has. Each is the one owner of its text, cursor and
 * selection, so switching away and back finds it as it was left; the
 * Draft has what it needs of it only as the mode hands it up, through
 * the `Owner` it Provides.
 *
 * 1. Modes   a Message, sent to the Session, with files and Skills; a
 *            Side Question, text only, asked of the Session on the side.
 *            A new session's Draft has only a Message: there is no
 *            Session to ask yet.
 * 2. Write   its View draws the Draft's card from its text, and the
 *            editor reports each edit and each move of the cursor. A
 *            Message that starts with `/btw` hands the rest up as a
 *            question, and empties.
 * 3. Send    its text goes up to the Draft, to send or ask. In a Session
 *            it empties at once; untaken or refused, the text comes back.
 *            On a device with no keyboard it holds the Touch Draft, which
 *            has it sent the same way.
 * 4. Keep    its text and selection go up to be kept in the Saved Draft,
 *            a quarter of a second after the last change, and at once as
 *            the page is hidden or left and as it goes.
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

/** What became of a text handed up to send or ask. */
export const Outcome = Schema.TaggedUnion({
  /** Nothing went: empty, or the Draft could not send it now. */
  Untaken: {},
  /** It went, and nothing more is told of it here. */
  Taken: {},
  Sent: {},
  Refused: { reason: Schema.String },
});
export type Outcome = typeof Outcome.Type;

/** What a Draft Mode asks of its owner, the Draft. */
export class Owner extends Context.Service<
  Owner,
  {
    /** Keeps the mode's text in its Saved Draft; `at` orders the writes. */
    readonly keep: (
      mode: Mode,
      written: Written,
      at: number,
    ) => Effect.Effect<void>;
    /** Sends the mode's text, or asks it, and says what became of it. */
    readonly send: (mode: Mode, text: string) => Effect.Effect<Outcome>;
    /** A Message started with `/btw`: `question` goes to a fresh Side Question. */
    readonly btw: (question: string) => Effect.Effect<void>;
  }
>()('code/DraftMode/Owner') {}

/** The Layer the Draft Provides: what each mode hands it. */
export const owner = <R>(given: Effect.Effect<Owner['Service'], never, R>) =>
  Layer.effect(Owner, given);

const sendUp = Command.make('DraftModeSends', {
  args: Schema.Struct({ mode: Mode, text: Schema.String }),
  run: ({ mode, text }) =>
    Effect.flatMap(Owner, (owner) => owner.send(mode, text)).pipe(
      Effect.map((outcome) => ({ _tag: 'Settled' as const, text, outcome })),
    ),
});

const carry = Command.make('DraftModeCarries', {
  args: Schema.Struct({ question: Schema.String }),
  run: ({ question }) => Effect.flatMap(Owner, (owner) => owner.btw(question)),
});

const Props = Schema.Struct({
  mode: Mode,
  /** A send empties it at once: a Session's. */
  clears: Schema.Boolean,
  /** A `/btw` at its start switches to a Side Question: a Session's Message. */
  btw: Schema.Boolean,
});

const Model = Schema.Struct({
  written: Written,
  /** How many changes there were to keep, and how many are kept. */
  changes: Schema.Finite,
  kept: Schema.Finite,
});

const DraftMode = Actor.define('DraftMode', {
  requires: [Owner],
  /** What it starts from; `changed`: not kept yet, as a question carried over. */
  input: Schema.Struct({ ...Written.fields, changed: Schema.Boolean }),
  props: Props,
  model: Model,
  message: Schema.TaggedUnion({
    Edited: Written.fields,
    SendAsked: {},
    Settled: { text: Schema.String, outcome: Outcome },
    Kept: { changes: Schema.Finite },
  }),
});

interface Data {
  readonly model: typeof Model.Type;
  readonly props: typeof Props.Type;
}

// 4. Keep
const { save, flush } = keeping(
  ({ model }: Data) => model.changes !== model.kept,
  ({ model, props }: Data, at) =>
    Effect.flatMap(Owner, (owner) => owner.keep(props.mode, model.written, at)),
);

export const DraftModeLive = Actor.build(DraftMode, {
  init: ({ changed, ...written }) => ({
    model: { written, changes: changed ? 1 : 0, kept: 0 },
  }),
  // 3. Send: on touch, through the Touch Draft.
  provides: (self) => TouchDraft.owner(self.send({ _tag: 'SendAsked' })),
  children: { touch: { actor: TouchDraft.actor } },
  workers: { save, flush },
  on: {
    // 2. Write
    Edited: ({ text, anchor, head }, { model, props }) => {
      const written = { text, anchor, head };
      const retyped = written.text !== model.written.text;
      const question = retyped && props.btw ? btwQuestion(written.text) : null;
      const changes = model.changes + 1;
      return question === null
        ? { model: { ...model, written, changes } }
        : {
            model: { ...model, written: blank, changes },
            command: carry({ question }),
          };
    },
    // 3. Send: a Message's emptying is kept with its send.
    SendAsked: (_, { model, props }) => ({
      model: !props.clears
        ? model
        : props.mode === 'Message'
          ? { ...model, written: blank, kept: model.changes }
          : { ...model, written: blank, changes: model.changes + 1 },
      command: sendUp({ mode: props.mode, text: model.written.text }),
    }),
    Settled: ({ text, outcome }, { model, props }) => {
      const back =
        props.clears &&
        text.trim() !== '' &&
        (outcome._tag === 'Untaken' || outcome._tag === 'Refused');
      if (!back) return {};
      const now = model.written.text;
      return {
        model: {
          ...model,
          written: writtenOf(now === '' ? text : `${text}\n\n${now}`),
          changes: model.changes + 1,
        },
      };
    },
    Kept: ({ changes }, { model }) => ({
      model: { ...model, kept: Math.max(model.kept, changes) },
    }),
  },
});
