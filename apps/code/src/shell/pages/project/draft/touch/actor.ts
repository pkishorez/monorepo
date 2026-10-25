import { Context, Effect, Layer, Queue, Schema, Stream } from 'effect';
import { Actor, Command } from '@kestack/kabuki';
import {
  Ask,
  DeviceState,
  Dictations,
} from '../../../../../layer/capabilities/index.ts';

/*
 * The Touch Draft: the Draft on a device with no keyboard, as its own
 * Actor beside the Draft's, which keeps its text. It says only which of
 * its States it is in, and drives the one Dictation through `Dictations`:
 * start, take, cancel. The Dictation says how it stands through `Heard`,
 * as its View hears it, and the Touch Draft follows: what it asked may
 * not happen, such as a start with no Machine to transcribe on. Whether
 * it is written by text or by voice is its Model, kept in Device State.
 *
 * 1. Resting       read only. The microphone starts a Dictation; once it
 *                  records, the Touch Draft is Recording.
 * 2. Recording     take: it is written out into the Draft; take and send:
 *                  the same, then the Draft is sent; cancel: thrown away.
 *                  A Dictation that stops on its own is taken.
 * 3. Transcribing  until its text is in, then Resting, or Sending when it
 *                  was taken to send and the Draft can be sent then; if
 *                  it cannot, as offline, the text stays in the Draft.
 *                  Failing, or with nothing heard, nothing is sent:
 *                  Resting, with the Dictation's Retry in the Draft. A
 *                  cancel still throws it away.
 * 4. Editing       the Composer, until done or sent.
 * 5. Sending       its owner, the Draft, is asked to send, then Resting.
 */

/** What is done with a Dictation's text once in: kept, or sent with the Draft. */
const Then = Schema.Literals(['take', 'send']);

export const State = Schema.TaggedUnion({
  Resting: {},
  Recording: {},
  /** `said`: its text has come, to go in. */
  Transcribing: { then: Then, said: Schema.Boolean },
  Editing: {},
  Sending: {},
});

/** How it is written: by typing, or by voice. */
export const Mode = Schema.Literals(['text', 'voice']);

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

const ask = Command.make('TouchDraftAsks', {
  args: Ask,
  run: (asked) =>
    Effect.flatMap(Dictations, ({ asked: queue }) =>
      Effect.asVoid(Queue.offer(queue, asked)),
    ),
});

/** Keeps the mode chosen; a write that fails is lost. */
const keepMode = Command.make('KeepTouchMode', {
  args: Schema.Struct({ mode: Mode }),
  run: ({ mode }) =>
    Effect.flatMap(DeviceState, (store) => store.setTouchMode(mode)).pipe(
      Effect.ignore,
    ),
});

const send = Command.make('TouchDraftSends', {
  run: () =>
    Effect.flatMap(Owner, (owner) => owner.send).pipe(
      Effect.as({ _tag: 'Sent' as const }),
    ),
});

export const TouchDraft = Actor.define('TouchDraft', {
  requires: [Dictations, DeviceState, Owner],
  model: Schema.Struct({ mode: Mode }),
  state: State,
  message: Schema.TaggedUnion({
    /** The microphone, at rest: start a Dictation. */
    Dictate: {},
    /** While it records: take it, and send the Draft once it is text if `send`. */
    Take: { send: Schema.Boolean },
    Cancel: {},
    Edit: {},
    Done: {},
    /** Send the Draft, at rest or from the Composer. */
    Send: {},
    Sent: {},
    /** `sendable`: nothing stops the Draft being sent now, such as being offline. */
    Heard: { dictation: Heard, sendable: Schema.Boolean },
    /** Text or voice, chosen. */
    Choose: { mode: Mode },
    ModeRead: { mode: Mode },
  }),
});

const resting = { _tag: 'Resting' as const };
const sending = { state: { _tag: 'Sending' as const }, command: send() };

export const TouchDraftLive = Actor.build(TouchDraft, {
  init: () => ({ model: { mode: 'voice' }, state: resting }),
  workers: {
    // The mode kept, read again after every write.
    mode: {
      run: (self) =>
        Stream.concat(Stream.make(undefined), DeviceState.changes).pipe(
          Stream.mapEffect(() =>
            Effect.map(DeviceState.read, ({ touchMode }) => touchMode),
          ),
          Stream.changes,
          Stream.runForEach((mode) => self.send({ _tag: 'ModeRead', mode })),
        ),
    },
  },
  state: {
    // 1. Resting
    Resting: {
      on: {
        Dictate: () => ({ command: ask({ _tag: 'Toggle' }) }),
        Edit: () => ({ state: { _tag: 'Editing' } }),
        Send: () => sending,
        Heard: ({ dictation }) =>
          dictation === 'recording'
            ? { state: { _tag: 'Recording' } }
            : dictation === 'transcribing'
              ? {
                  state: { _tag: 'Transcribing', then: 'take', said: false },
                }
              : {},
      },
    },
    // 2. Recording
    Recording: {
      on: {
        Take: ({ send: then }) => ({
          state: {
            _tag: 'Transcribing',
            then: then ? 'send' : 'take',
            said: false,
          },
          command: ask({ _tag: 'Toggle' }),
        }),
        Cancel: () => ({ state: resting, command: ask({ _tag: 'Cancel' }) }),
        Heard: ({ dictation }) =>
          dictation === 'transcribing'
            ? { state: { _tag: 'Transcribing', then: 'take', said: false } }
            : dictation === 'recording'
              ? {}
              : { state: resting },
      },
    },
    // 3. Transcribing
    Transcribing: {
      on: {
        Cancel: () => ({ state: resting, command: ask({ _tag: 'Cancel' }) }),
        Heard: ({ dictation, sendable }, { state }) => {
          if (dictation === 'text') return { state: { ...state, said: true } };
          if (dictation === 'failed') return { state: resting };
          if (dictation !== 'idle') return {};
          return state.said && state.then === 'send' && sendable
            ? sending
            : { state: resting };
        },
      },
    },
    // 4. Editing
    Editing: {
      on: {
        Done: () => ({ state: resting }),
        Send: () => sending,
      },
    },
    // 5. Sending
    Sending: {
      on: { Sent: () => ({ state: resting }) },
    },
  },
  on: {
    Choose: ({ mode }, { model }) => ({
      model: { ...model, mode },
      command: keepMode({ mode }),
    }),
    ModeRead: ({ mode }, { model }) => ({ model: { ...model, mode } }),
  },
});

/** The Layer the Draft Provides: how the Touch Draft has it sent. */
export const owner = (sendDraft: Effect.Effect<void>) =>
  Layer.succeed(Owner, { send: sendDraft });
