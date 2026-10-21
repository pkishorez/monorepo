import { Cause, Effect, Layer, Queue, Schema, Stream } from 'effect';
import {
  HarnessError,
  Harnesses,
  Titler,
  type Harness,
  type OpenConfig,
  type RawOut,
} from '../harness/index.js';

/*
 * A harness for tests, named `claude`. Each turn emits `echo:<text>` at once.
 * By default it then ends with a `result`; held, it waits for `finish()`.
 * A steer emits `steer:<text>` into the running turn; a cancel ends the
 * turn without a result, as an interrupted agent would.
 */

const Text = Schema.Struct({ text: Schema.String });

export interface FakeHarness {
  readonly harness: Harness;
  readonly layer: Layer.Layer<Harnesses | Titler>;
  /** Every open, with what it was opened with. */
  readonly opens: Array<OpenConfig>;
  /** How many agents were closed. */
  readonly closes: () => number;
  /** Ends the running turn with a `result`. */
  readonly finish: Effect.Effect<void>;
  /** Fails the running turn. */
  readonly fail: (message: string) => Effect.Effect<void>;
}

export const makeFakeHarness = (
  options: {
    /** Turns wait for `finish()` instead of ending at once. */
    readonly hold?: boolean;
    /** What the Titler answers; a failure when undefined. */
    readonly title?: string;
    /** The agent ignores a cancel. */
    readonly stubborn?: boolean;
  } = {},
): FakeHarness => {
  const opens: Array<OpenConfig> = [];
  let closed = 0;
  let running: Queue.Queue<RawOut, HarnessError | Cause.Done> | undefined;

  const harness: Harness = {
    name: 'claude',
    label: 'Fake',
    modelsProvider: 'anthropic',
    acceptsModel: (id) => id.startsWith('claude-'),
    defaultModel: 'claude-test',
    settings: [
      {
        key: 'effort',
        label: 'Effort',
        choices: [{ value: 'high', label: 'High' }],
        default: 'high',
      },
    ],
    open: (config) =>
      Effect.gen(function* () {
        opens.push(config);
        const nativeId = config.nativeId ?? `native-${opens.length}`;
        yield* Effect.addFinalizer(() => Effect.sync(() => void closed++));
        return {
          nativeId: Effect.succeed(nativeId),
          turn: (text) =>
            Stream.unwrap(
              Effect.gen(function* () {
                const queue = yield* Queue.unbounded<
                  RawOut,
                  HarnessError | Cause.Done
                >();
                running = queue;
                Queue.offerUnsafe(queue, {
                  kind: 'text',
                  payload: { text: `echo:${text}` },
                });
                if (!options.hold) {
                  Queue.offerUnsafe(queue, { kind: 'result', payload: {} });
                  Queue.endUnsafe(queue);
                }
                return Stream.fromQueue(queue);
              }),
            ),
          steer: (text) =>
            Effect.sync(() => {
              if (running)
                Queue.offerUnsafe(running, {
                  kind: 'text',
                  payload: { text: `steer:${text}` },
                });
            }),
          cancel: Effect.sync(() => {
            if (running && !options.stubborn) Queue.endUnsafe(running);
          }),
        };
      }),
    project: (raw) => {
      if (raw.kind === 'result')
        return {
          agentId: null,
          role: 'system',
          parts: [{ type: 'turnEnded', status: 'done' }],
        };
      if (raw.kind === 'hidden') return null;
      const text = Schema.decodeUnknownOption(Text)(raw.payload);
      return text._tag === 'Some'
        ? {
            agentId: raw.agentId,
            role: 'assistant',
            parts: [{ type: 'text', text: text.value.text }],
          }
        : null;
    },
  };

  const layer = Layer.merge(
    Layer.succeed(Harnesses, {
      all: [harness],
      get: (name) => {
        if (name !== 'claude') throw new Error(`No harness ${name}`);
        return harness;
      },
    }),
    Layer.succeed(Titler, {
      title: () =>
        options.title === undefined
          ? Effect.fail(new HarnessError({ message: 'no titles here' }))
          : Effect.succeed(options.title),
    }),
  );

  return {
    harness,
    layer,
    opens,
    closes: () => closed,
    finish: Effect.sync(() => {
      if (!running) return;
      Queue.offerUnsafe(running, { kind: 'result', payload: {} });
      Queue.endUnsafe(running);
    }),
    fail: (message) =>
      Effect.sync(() => {
        if (running)
          Queue.failCauseUnsafe(
            running,
            Cause.fail(new HarnessError({ message })),
          );
      }),
  };
};
