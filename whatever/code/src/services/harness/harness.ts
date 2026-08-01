import {
  StreamProcessor,
  type StreamChunk,
  type UIMessage,
} from '@tanstack/ai';
import {
  Cause,
  Clock,
  Context,
  Deferred,
  Effect,
  Layer,
  Queue,
  Stream,
} from 'effect';
import { runErrorFrom, sessionIdFrom } from './chunk-readers.js';
import {
  claudeCodeChat,
  codexChat,
  type StartHarnessRunInput,
} from './internal/index.js';

export interface HarnessRunOutcome {
  chunkCount: number;
  durationMs: number;
  interrupted: boolean;
  runError: { code: string | null; message: string } | null;
  finishReason: string | null;
  sessionId: string | null;
  messages: UIMessage[];
}

interface ActiveRun {
  threadId: string;
  abortController: AbortController;
  interrupted: boolean;
}

const makeHarness = () => {
  const runs = new Map<string, ActiveRun>();

  const start = (input: StartHarnessRunInput) =>
    Effect.gen(function* () {
      const active: ActiveRun = {
        threadId: input.threadId,
        abortController: new AbortController(),
        interrupted: false,
      };
      runs.set(input.runId, active);

      const chunks =
        input.configuration._tag === 'Codex'
          ? codexChat(
              { ...input, configuration: input.configuration },
              active.abortController,
            )
          : claudeCodeChat(
              { ...input, configuration: input.configuration },
              active.abortController,
            );

      const queue = yield* Queue.make<StreamChunk, Cause.Done>();
      const outcome = yield* Deferred.make<HarnessRunOutcome>();
      const startedAt = yield* Clock.currentTimeMillis;
      let chunkCount = 0;
      const state: Omit<HarnessRunOutcome, 'interrupted'> = {
        chunkCount: 0,
        durationMs: 0,
        runError: null,
        finishReason: null,
        sessionId: null,
        messages: [],
      };

      const pump = Effect.gen(function* () {
        const processor = new StreamProcessor({
          initialMessages: [input.message],
        });
        const observed = async function* () {
          for await (const chunk of chunks) {
            chunkCount += 1;
            state.runError ??= runErrorFrom(chunk);
            state.sessionId =
              sessionIdFrom(input.configuration._tag, chunk) ?? state.sessionId;
            Queue.offerUnsafe(queue, chunk);
            yield chunk;
          }
        };
        const result = yield* Effect.tryPromise({
          try: () => processor.process(observed()),
          catch: (error) =>
            error instanceof Error ? error.message : String(error),
        }).pipe(
          Effect.catch((message) =>
            Effect.sync(() => {
              state.runError ??= { code: null, message };
              return null;
            }),
          ),
        );
        state.finishReason = result?.finishReason ?? null;
        state.messages = processor
          .getMessages()
          .filter((assembled) => assembled.id !== input.message.id);
        if (state.runError !== null && !active.interrupted) {
          return yield* Effect.fail(new Error(state.runError.message));
        }
      }).pipe(
        Effect.ensuring(
          Effect.gen(function* () {
            const durationMs = Math.max(
              0,
              (yield* Clock.currentTimeMillis) - startedAt,
            );
            runs.delete(input.runId);
            yield* Effect.annotateCurrentSpan({
              'run.chunk_count': chunkCount,
              'run.duration_ms': durationMs,
              'run.interrupted': active.interrupted,
              ...(state.runError !== null && !active.interrupted
                ? {
                    'error.type': state.runError.code ?? 'harness_run_error',
                    'error.message': state.runError.message,
                  }
                : {}),
            });
            yield* Deferred.succeed(outcome, {
              ...state,
              chunkCount,
              durationMs,
              interrupted: active.interrupted,
            });
            yield* Queue.end(queue);
          }),
        ),
        Effect.withSpan('code.run.execute', {
          attributes: {
            'thread.id': input.threadId,
            'run.id': input.runId,
            harness: input.configuration._tag,
            model: input.configuration.model,
            'harness.has_session': input.sessionId !== null,
          },
        }),
        Effect.ignore,
      );

      yield* Effect.forkDetach(pump);

      return {
        chunks: Stream.fromQueue(queue),
        outcome: Deferred.await(outcome),
      };
    });

  return {
    start,
    interrupt: (input: { threadId: string; runId: string }) =>
      Effect.sync(() => {
        const active = runs.get(input.runId);
        if (!active || active.threadId !== input.threadId) return false;
        active.interrupted = true;
        active.abortController.abort();
        return true;
      }),
    isBusy: (threadId: string) =>
      Effect.sync(() =>
        [...runs.values()].some((run) => run.threadId === threadId),
      ),
  };
};

export class Harness extends Context.Service<
  Harness,
  ReturnType<typeof makeHarness>
>()('code/Harness') {}

export const harnessLayer = Layer.sync(Harness, makeHarness);
