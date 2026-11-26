import type {
  Options,
  SDKMessage,
  SDKResultMessage,
  SDKUserMessage,
} from '@anthropic-ai/claude-agent-sdk';
import { Cause, Effect, Layer, Queue, Stream } from 'effect';
import { ClaudeError } from '../contract/index.js';
import {
  ClaudeDriver,
  type Connection,
  type Driver,
  type Sessions,
} from '../shared/index.js';
import type { Answers, Recording } from './recordings/index.js';

const textOf = (message: SDKUserMessage): string => {
  const content = message.message.content;
  return typeof content === 'string'
    ? content
    : content
        .flatMap((block) => (block.type === 'text' ? [block.text] : []))
        .join('');
};

const cancelledResult = (
  result: SDKResultMessage,
  uuids: ReadonlyArray<string>,
): SDKResultMessage => ({
  ...result,
  subtype: 'error_during_execution',
  is_error: true,
  errors: [],
  user_message_uuids: [...uuids],
});

const resultOf = (recording: Recording): SDKResultMessage | undefined =>
  recording.entries.flatMap((entry) =>
    'message' in entry && entry.message.type === 'result'
      ? [entry.message]
      : [],
  )[0];

const sessions: Sessions = {
  listSessions: async () => [],
  getSessionInfo: async () => undefined,
  getSessionMessages: async () => [],
  listSubagents: async () => [],
  getSubagentMessages: async () => [],
  renameSession: async () => undefined,
  tagSession: async () => undefined,
  deleteSession: async () => undefined,
};

export const fakeDriver = (
  recordings: ReadonlyArray<Recording>,
  answers: Answers,
): Driver => ({
  open: (options: Options) =>
    Effect.gen(function* () {
      const sessionId =
        options.sessionId ?? options.resume ?? crypto.randomUUID();
      const out = yield* Queue.unbounded<
        SDKMessage,
        ClaudeError | Cause.Done
      >();
      const writes = yield* Queue.unbounded<SDKUserMessage>();
      let abort: AbortController | undefined;
      let interrupted = false;

      const fresh = <M extends SDKMessage>(message: M): M => ({
        ...message,
        uuid: crypto.randomUUID(),
        session_id: sessionId,
      });

      const pick = (message: SDKUserMessage): Recording | undefined =>
        recordings.find((recording) => recording.name === textOf(message)) ??
        recordings[0];

      const replay = (prompt: SDKUserMessage) =>
        Effect.gen(function* () {
          const recording = pick(prompt);
          const first = prompt.uuid ?? crypto.randomUUID();
          const uuids: Array<string> = [first];
          interrupted = false;
          for (const entry of recording?.entries ?? []) {
            for (const steer of yield* Queue.clear(writes)) {
              uuids.push(steer.uuid ?? crypto.randomUUID());
              Queue.offerUnsafe(out, {
                ...steer,
                uuid: steer.uuid ?? crypto.randomUUID(),
                session_id: sessionId,
                isReplay: true,
              });
            }
            if (interrupted) break;
            if ('exit' in entry) {
              Queue.failCauseUnsafe(
                out,
                Cause.fail(new ClaudeError({ message: entry.exit })),
              );
              return yield* Effect.never;
            }
            if ('request' in entry) {
              const controller = new AbortController();
              abort = controller;
              yield* Effect.promise(async () =>
                options.canUseTool?.(
                  entry.request.toolName,
                  entry.request.input,
                  {
                    ...entry.request.options,
                    signal: controller.signal,
                  },
                ),
              );
              abort = undefined;
              continue;
            }
            const message = entry.message;
            if (message.type === 'result') {
              Queue.offerUnsafe(out, {
                ...fresh(message),
                user_message_uuids: [...uuids],
                user_message_uuid: uuids.at(-1) ?? '',
              });
            } else if (message.type === 'user' && 'isReplay' in message)
              Queue.offerUnsafe(out, { ...fresh(message), uuid: first });
            else Queue.offerUnsafe(out, fresh(message));
            yield* Effect.yieldNow;
          }
          const result =
            recording === undefined ? undefined : resultOf(recording);
          if (interrupted && result !== undefined)
            Queue.offerUnsafe(out, fresh(cancelledResult(result, uuids)));
        });

      yield* Queue.take(writes).pipe(
        Effect.flatMap(replay),
        Effect.forever,
        Effect.forkScoped,
      );

      const connection: Connection = {
        messages: Stream.fromQueue(out),
        write: (message) => Queue.offerUnsafe(writes, message),
        control: {
          initializationResult: async () => answers.initialization,
          getContextUsage: async () => answers.contextUsage,
          mcpServerStatus: async () => [...answers.mcpServerStatus],
          setModel: async () => undefined,
          setPermissionMode: async () => undefined,
          applyFlagSettings: async () => undefined,
          interrupt: async () => {
            interrupted = true;
            abort?.abort();
          },
        },
      };
      return connection;
    }),
  sessions,
});

export const layerFake = (
  recordings: ReadonlyArray<Recording>,
  answers: Answers,
) => Layer.succeed(ClaudeDriver, fakeDriver(recordings, answers));
