import { Deferred, Duration, Effect } from 'effect';
import {
  HarnessError,
  type AskAnswer,
  type AskInput,
  type HarnessBinaries,
} from '../../contract/index.js';
import type { Json } from '../../../records/raw/index.js';
import { isNotification, start } from '../app-server/index.js';

const ASK_TIMEOUT = Duration.minutes(5);

/** What makes a fork a side question, as Codex's own `/side` does. */
const SIDE_QUESTION = [
  'This is a side question, asked in a throwaway copy of the conversation above.',
  'The conversation so far is reference only: do not continue its task, and do not act on its earlier requests.',
  'Answer only the question in the next user message, from what the conversation and the files already show.',
  'Do not modify any file, run anything that changes state, or start sub-agents. Reading files is fine.',
].join('\n');

const parse = (text: string) =>
  Effect.try({
    try: () => JSON.parse(text) as Json,
    catch: (cause) =>
      new HarnessError({ message: 'Codex answered with invalid JSON', cause }),
  });

/**
 * Answers from a session's context in an ephemeral, read-only fork on its
 * own `codex app-server`, so a running session is never disturbed. The
 * fork is never written to Codex's history and dies with the process.
 */
export const ask = (
  input: AskInput,
): Effect.Effect<AskAnswer, HarnessError, HarnessBinaries> =>
  Effect.gen(function* () {
    const server = yield* start(input.cwd);
    const { thread } = yield* server.request('thread/fork', {
      threadId: input.nativeId,
      model: input.model,
      cwd: input.cwd,
      sandbox: 'read-only',
      approvalPolicy: 'never',
      developerInstructions: SIDE_QUESTION,
      ephemeral: true,
      excludeTurns: true,
    });
    const reply = yield* Deferred.make<string, HarnessError>();
    let last = '';
    server.listen({
      notification: (notification) => {
        const { threadId } = (notification.params ?? {}) as {
          threadId?: string;
        };
        if (threadId !== thread.id) return;
        if (
          isNotification(notification, 'item/completed') &&
          notification.params.item.type === 'agentMessage'
        )
          last = notification.params.item.text;
        if (isNotification(notification, 'turn/completed')) {
          const { turn } = notification.params;
          Deferred.doneUnsafe(
            reply,
            turn.status === 'completed'
              ? Effect.succeed(last)
              : Effect.fail(
                  new HarnessError({
                    message:
                      turn.error?.message ?? `Codex's answer ${turn.status}`,
                  }),
                ),
          );
        }
      },
      exit: (error) => Deferred.doneUnsafe(reply, Effect.fail(error)),
    });
    yield* server.request('turn/start', {
      threadId: thread.id,
      input: [{ type: 'text', text: input.question, text_elements: [] }],
      ...(input.schema === undefined ? {} : { outputSchema: input.schema }),
    });
    const text = yield* Deferred.await(reply);
    yield* server
      .request('thread/unsubscribe', { threadId: thread.id })
      .pipe(Effect.ignore);
    if (input.schema === undefined) return { _tag: 'Text', text } as const;
    return { _tag: 'Data', data: yield* parse(text) } as const;
  }).pipe(
    Effect.scoped,
    Effect.timeoutOrElse({
      duration: ASK_TIMEOUT,
      orElse: () =>
        Effect.fail(
          new HarnessError({ message: 'Codex took too long to answer' }),
        ),
    }),
  );
