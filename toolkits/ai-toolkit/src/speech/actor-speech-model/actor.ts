import { Effect, Schema } from 'effect';
import { Actor, type Self } from '@kestack/kabuki';
import { SpeechHost, type Fetched } from '../capabilities/index.js';

/*
 * The Speech to Text model on this Machine as an Actor. Its State is what
 * is on disk: Off has nothing there, so it deletes what is left; Downloading
 * keeps the wish and fetches the files; Ready has them, and answers
 * transcribe; Failed keeps the wish, so a restart tries again, as Enable
 * does now. It loads itself first: the wish and the files say where it
 * starts.
 */

/** Progress Sent at most every this share of the total, so a download is about 200 Messages. */
const STEPS = 200;

/** Progress Sent at most every this many bytes when the total is not known. */
const UNKNOWN_STEP = 1024 * 1024;

const State = Schema.TaggedUnion({
  Loading: {},
  Off: {},
  Downloading: { done: Schema.Number, total: Schema.NullOr(Schema.Number) },
  Ready: {},
  Failed: { reason: Schema.String },
});
type State = typeof State.Type;

const Message = Schema.TaggedUnion({
  Loaded: { on: Schema.Boolean, installed: Schema.Boolean },
  Enable: {},
  Disable: {},
  Fetched: { done: Schema.Number, total: Schema.NullOr(Schema.Number) },
  Downloaded: {},
  DownloadFailed: { reason: Schema.String },
});

type SpeechModelSelf = Pick<Self<unknown, State, typeof Message.Type>, 'send'>;

const downloading: State = { _tag: 'Downloading', done: 0, total: null };

/** Fetches the model, Sending its progress a step at a time. */
const download = (self: SpeechModelSelf) =>
  Effect.gen(function* () {
    const host = yield* SpeechHost;
    let sent = -Infinity;
    const progress = ({ done, total }: Fetched) => {
      const step = total === null ? UNKNOWN_STEP : total / STEPS;
      if (done - sent < step && done !== total) return Effect.void;
      sent = done;
      return self.send({ _tag: 'Fetched', done, total });
    };
    yield* host.install(progress).pipe(
      Effect.andThen(self.send({ _tag: 'Downloaded' })),
      Effect.catch((reason) => self.send({ _tag: 'DownloadFailed', reason })),
    );
  });

export const SpeechModel = Actor.build(
  Actor.define('SpeechModel', {
    requires: [SpeechHost],
    state: State,
    message: Message,
  }),
  {
    init: () => ({ state: { _tag: 'Loading' } }),
    on: {
      Disable: (_, { state }) =>
        state._tag === 'Off' ? {} : { state: { _tag: 'Off' } },
    },
    state: {
      Loading: {
        on: {
          Loaded: ({ on, installed }) => ({
            state: !on
              ? { _tag: 'Off' }
              : installed
                ? { _tag: 'Ready' }
                : downloading,
          }),
        },
        workers: {
          load: {
            run: (self) =>
              Effect.gen(function* () {
                const host = yield* SpeechHost;
                yield* self.send({
                  _tag: 'Loaded',
                  on: yield* host.wished,
                  installed: yield* host.installed,
                });
              }),
          },
        },
      },
      Off: {
        on: { Enable: () => ({ state: downloading }) },
        workers: {
          remove: {
            run: () => Effect.flatMap(SpeechHost, (host) => host.remove),
          },
        },
      },
      Downloading: {
        on: {
          Fetched: ({ done, total }) => ({
            state: { _tag: 'Downloading', done, total },
          }),
          Downloaded: () => ({ state: { _tag: 'Ready' } }),
          DownloadFailed: ({ reason }) => ({
            state: { _tag: 'Failed', reason },
          }),
        },
        workers: { download: { run: download } },
      },
      Ready: {
        queries: {
          transcribe: {
            run: (_, samples: Float32Array) =>
              Effect.flatMap(SpeechHost, (host) => host.transcribe(samples)),
          },
        },
      },
      Failed: {
        on: { Enable: () => ({ state: downloading }) },
      },
    },
  },
);
