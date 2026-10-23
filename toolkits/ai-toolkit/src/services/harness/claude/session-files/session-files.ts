import { forkSession } from '@anthropic-ai/claude-agent-sdk';
import { Effect } from 'effect';
import {
  HarnessError,
  type AskAnswer,
  type AskInput,
  type ForkInput,
} from '../../contract/index.js';
import { askOptions, runAsk, toAnswer } from './ask.js';
import { readTranscript, resolveEntry } from './transcript.js';

/**
 * Copies a session's transcript into a new session, up to the Fork Point's
 * entry when one is given. The Fork Point may have been recorded in a
 * session this one was forked from.
 */
export const fork = (
  input: ForkInput,
): Effect.Effect<{ readonly nativeId: string }, HarnessError> =>
  Effect.gen(function* () {
    const upTo =
      input.at === undefined
        ? undefined
        : resolveEntry(input.nativeId, input.at, readTranscript);
    if (input.at !== undefined && upTo === undefined) {
      return yield* Effect.fail(
        new HarnessError({
          message: `No entry ${input.at} in session ${input.nativeId} to fork at`,
        }),
      );
    }
    const forked = yield* Effect.tryPromise({
      try: () =>
        forkSession(input.nativeId, {
          dir: input.cwd,
          ...(upTo === undefined ? {} : { upToMessageId: upTo }),
        }),
      catch: (cause) =>
        new HarnessError({ message: 'Claude Code did not fork', cause }),
    });
    return { nativeId: forked.sessionId };
  });

/** Answers a question from a session's context in a fork never kept. */
export const ask = (
  input: AskInput,
  executable: string | undefined,
): Effect.Effect<AskAnswer, HarnessError> =>
  Effect.tryPromise({
    try: (signal) => {
      const abort = new AbortController();
      signal.addEventListener('abort', () => abort.abort());
      return runAsk(input, askOptions(input, executable, abort));
    },
    catch: (cause) =>
      new HarnessError({ message: 'Claude Code did not answer', cause }),
  }).pipe(
    Effect.flatMap((result) => {
      const answer = toAnswer(result, input.schema !== undefined);
      return typeof answer === 'string'
        ? Effect.fail(new HarnessError({ message: answer }))
        : Effect.succeed(answer);
    }),
  );
