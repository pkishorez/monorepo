import { Context, Effect, Layer, Schema, Stream } from 'effect';
import { Actor, Command } from '@kestack/kabuki';
import { Preferences } from '../../../../../../../../store.ts';

/*
 * The Touch Draft: the Draft on a device with no keyboard, as its own
 * Actor beside the Draft's, which keeps its text. One line at the page's
 * foot until it is opened; it says only which of its States it is in.
 * Its View starts, takes and cancels the one Dictation through the
 * Draft's mic, and tells it here; the Dictation says how it stands
 * through `Heard`, as its View hears it, and the Touch Draft follows:
 * what was asked may not happen, such as a start with no Connection to
 * transcribe on. Whether it takes
 * Smart Input, and Smart Displacement, is its Model, kept in Preferences.
 *
 * 1. Collapsed     one line, read only. Opened, it is Editing; with Smart
 *                  Input, Expanded.
 * 2. Expanded      open and read only, the keyboard down: a tap in its
 *                  words places the caret, for the next Dictation. Edit
 *                  makes it Editing.
 * 3. Editing       the Composer, the keyboard up, until collapsed or sent;
 *                  Done, with Smart Input, goes back to Expanded.
 * 4. Recording     take: it is written out into the Draft; take and send:
 *                  the same, then the Draft is sent; cancel: thrown away.
 *                  A Dictation that stops on its own is taken. `open`:
 *                  started open, and goes back to Expanded; collapsed,
 *                  it goes on, on one line.
 * 5. Transcribing  until its text is in, then back, or Sending when it
 *                  was taken to send and the Draft can be sent then; if
 *                  it cannot, as offline, the text stays in the Draft.
 *                  Failing, or with nothing heard, nothing is sent, the
 *                  Dictation's Retry in the Draft. A cancel throws it
 *                  away.
 * 6. Sending       its owner, the Draft, is asked to send, then Collapsed.
 */

/** What is done with a Dictation's text once in: kept, or sent with the Draft. */
const Then = Schema.Literals(['take', 'send']);

export const State = Schema.TaggedUnion({
  Collapsed: {},
  Expanded: {},
  Editing: {},
  Recording: { open: Schema.Boolean },
  /** `said`: its text has come, to go in. */
  Transcribing: { then: Then, said: Schema.Boolean, open: Schema.Boolean },
  Sending: {},
});

/** How the Dictation stands, as this Draft sees it: starting counts as recording. */
export const Heard = Schema.Literals([
  'idle',
  'recording',
  'transcribing',
  'failed',
  'text',
]);

/** What the Touch Draft asks of its owner, the Draft. */
export class Owner extends Context.Service<
  Owner,
  { readonly send: Effect.Effect<void> }
>()('code/TouchDraft/Owner') {}

const send = Command.make('TouchDraftSends', {
  run: () =>
    Effect.flatMap(Owner, (owner) => owner.send).pipe(
      Effect.as({ _tag: 'Sent' as const }),
    ),
});

export const TouchDraft = Actor.define('TouchDraft', {
  requires: [Preferences, Owner],
  model: Schema.Struct({ smart: Schema.Boolean, displace: Schema.Boolean }),
  state: State,
  message: Schema.TaggedUnion({
    /** While it records, as its View stops it: take it, and send the Draft once it is text if `send`. */
    Take: { send: Schema.Boolean },
    Cancel: {},
    /** A tap on it, collapsed. */
    Open: {},
    /** Type in it: the Composer. */
    Edit: {},
    /** Stop typing in it, and keep it open. */
    Done: {},
    Collapse: {},
    /** Send the Draft, from wherever it rests. */
    Send: {},
    Sent: {},
    /** `sendable`: nothing stops the Draft being sent now, such as being offline. */
    Heard: { dictation: Heard, sendable: Schema.Boolean },
    /** Whether it takes Smart Input, as Preferences keeps it. */
    SmartRead: { on: Schema.Boolean },
    /** Whether it takes Smart Displacement, as Preferences keeps it. */
    DisplacementRead: { on: Schema.Boolean },
  }),
});

const collapsed = { _tag: 'Collapsed' as const };
const sending = { state: { _tag: 'Sending' as const }, command: send() };
const back = (open: boolean) =>
  open ? { _tag: 'Expanded' as const } : collapsed;
const transcribing = (open: boolean, then: 'take' | 'send' = 'take') => ({
  _tag: 'Transcribing' as const,
  then,
  said: false,
  open,
});

/** At rest, collapsed or open: a Dictation started, here or elsewhere, is followed. */
const atRest = (open: boolean) => ({
  Send: () => sending,
  Heard: ({ dictation }: { readonly dictation: typeof Heard.Type }) =>
    dictation === 'recording'
      ? { state: { _tag: 'Recording' as const, open } }
      : dictation === 'transcribing'
        ? { state: transcribing(open) }
        : {},
});

const editing = { state: { _tag: 'Editing' as const } };

export const TouchDraftLive = Actor.build(TouchDraft, {
  init: () => ({ model: { smart: false, displace: false }, state: collapsed }),
  workers: {
    // Smart Input as kept, read again after every write.
    smart: {
      run: (self) =>
        Stream.concat(Stream.make(undefined), Preferences.changes).pipe(
          Stream.mapEffect(() =>
            Effect.map(Preferences.read, ({ smartInput }) => smartInput),
          ),
          Stream.changes,
          Stream.runForEach((on) => self.send({ _tag: 'SmartRead', on })),
        ),
    },
    // Smart Displacement the same.
    displace: {
      run: (self) =>
        Stream.concat(Stream.make(undefined), Preferences.changes).pipe(
          Stream.mapEffect(() =>
            Effect.map(
              Preferences.read,
              ({ smartDisplacement }) => smartDisplacement,
            ),
          ),
          Stream.changes,
          Stream.runForEach((on) =>
            self.send({ _tag: 'DisplacementRead', on }),
          ),
        ),
    },
  },
  state: {
    // 1. Collapsed
    Collapsed: {
      on: {
        ...atRest(false),
        Open: (_, { model }) =>
          model.smart ? { state: { _tag: 'Expanded' } } : editing,
        Edit: () => editing,
      },
    },
    // 2. Expanded
    Expanded: {
      on: {
        ...atRest(true),
        Edit: () => editing,
        Collapse: () => ({ state: collapsed }),
      },
    },
    // 3. Editing
    Editing: {
      on: {
        ...atRest(true),
        Done: () => ({ state: { _tag: 'Expanded' } }),
        Collapse: () => ({ state: collapsed }),
      },
    },
    // 4. Recording
    Recording: {
      on: {
        Take: ({ send: then }, { state }) => ({
          state: transcribing(state.open, then ? 'send' : 'take'),
        }),
        Cancel: (_, { state }) => ({ state: back(state.open) }),
        Collapse: (_, { state }) => ({ state: { ...state, open: false } }),
        Heard: ({ dictation }, { state }) =>
          dictation === 'transcribing'
            ? { state: transcribing(state.open) }
            : dictation === 'recording'
              ? {}
              : { state: back(state.open) },
      },
    },
    // 5. Transcribing
    Transcribing: {
      on: {
        Cancel: (_, { state }) => ({ state: back(state.open) }),
        Collapse: (_, { state }) => ({ state: { ...state, open: false } }),
        Heard: ({ dictation, sendable }, { state }) => {
          if (dictation === 'text') return { state: { ...state, said: true } };
          if (dictation === 'failed') return { state: back(state.open) };
          if (dictation !== 'idle') return {};
          return state.said && state.then === 'send' && sendable
            ? sending
            : { state: back(state.open) };
        },
      },
    },
    // 6. Sending
    Sending: {
      on: { Sent: () => ({ state: collapsed }) },
    },
  },
  on: {
    SmartRead: ({ on }, { model }) => ({ model: { ...model, smart: on } }),
    DisplacementRead: ({ on }, { model }) => ({
      model: { ...model, displace: on },
    }),
  },
});

/** The Layer the Draft Provides: how the Touch Draft has it sent. */
export const owner = (sendDraft: Effect.Effect<void>) =>
  Layer.succeed(Owner, { send: sendDraft });
