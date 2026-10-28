import type { PermissionResult } from '@anthropic-ai/claude-agent-sdk';
import { Deferred, Effect, Stream, SubscriptionRef } from 'effect';
import {
  HarnessError,
  type AgentQuestion,
  type QuestionAnswer,
  type RawOut,
} from '../../../contract/index.js';
import {
  QUESTION_ANSWERED,
  type QuestionAnswered,
} from '../../project/index.js';
import { answered, DECLINED, toQuestion } from './ask-user-question.js';

export interface Questions {
  /**
   * Asks the user what an `AskUserQuestion` call asks, and waits: allowed
   * with their answers, denied when they decline, the Turn ends or the
   * call is aborted.
   */
  readonly ask: (
    toolUseId: string,
    input: Record<string, unknown>,
    signal: AbortSignal,
  ) => Effect.Effect<PermissionResult>;
  /** The current list first, then each change. */
  readonly changes: Stream.Stream<ReadonlyArray<AgentQuestion>>;
  readonly answer: (
    id: string,
    answer: QuestionAnswer | null,
  ) => Effect.Effect<void, HarnessError>;
  /** Declines every one, as when their Turn ends or Claude Code exits. */
  readonly clear: Effect.Effect<void>;
}

interface Asked {
  readonly question: AgentQuestion;
  readonly reply: Deferred.Deferred<QuestionAnswer | null>;
}

const denied: PermissionResult = { behavior: 'deny', message: DECLINED };

/** Never shown to the user, so it is not theirs to decline. */
const unreadable: PermissionResult = {
  behavior: 'deny',
  message:
    'The question could not be read, so the user never saw it. Ask again with a valid `questions` list.',
};

/**
 * The Agent Questions Claude Code waits on. Each is one `AskUserQuestion`
 * call held in `canUseTool` until the user answers; it leaves the list as
 * soon as it is answered, declined or aborted. `record` writes what the
 * user answered or declined into the running Turn, as `question.answered`;
 * one aborted, or dropped as its Turn ends, was never answered.
 */
export const makeQuestions = (
  record: (out: RawOut) => Effect.Effect<void>,
): Effect.Effect<Questions> =>
  Effect.gen(function* () {
    const list = yield* SubscriptionRef.make<ReadonlyArray<AgentQuestion>>([]);
    const asked = new Map<string, Asked>();

    const drop = (id: string) =>
      SubscriptionRef.update(list, (questions) =>
        questions.filter((question) => question.id !== id),
      );

    /** Ends when the call is aborted, as when its Turn is cancelled. */
    const aborted = (signal: AbortSignal) =>
      Effect.callback<null>((resume) => {
        const abort = () => resume(Effect.succeed(null));
        if (signal.aborted) return abort();
        signal.addEventListener('abort', abort, { once: true });
        return Effect.sync(() => signal.removeEventListener('abort', abort));
      });

    const ask: Questions['ask'] = (toolUseId, input, signal) =>
      Effect.gen(function* () {
        const question = toQuestion(toolUseId, input, Date.now());
        if (question === undefined) return unreadable;
        const reply = yield* Deferred.make<QuestionAnswer | null>();
        asked.set(question.id, { question, reply });
        yield* SubscriptionRef.update(list, (questions) => [
          ...questions,
          question,
        ]);
        const answer = yield* Effect.raceFirst(
          Deferred.await(reply),
          aborted(signal),
        ).pipe(
          Effect.ensuring(
            Effect.suspend(() => {
              asked.delete(question.id);
              return drop(question.id);
            }),
          ),
        );
        return answer === null
          ? denied
          : {
              behavior: 'allow',
              updatedInput: answered(question, input, answer),
            };
      });

    return {
      ask,
      changes: SubscriptionRef.changes(list),
      answer: (id, answer) =>
        Effect.suspend(() => {
          const one = asked.get(id);
          if (one === undefined)
            return Effect.fail(
              new HarnessError({ message: `No question ${id} is asked` }),
            );
          // Gone at once, so a second answer fails.
          asked.delete(id);
          const given: QuestionAnswered = { toolUseId: id, answers: answer };
          return record({ kind: QUESTION_ANSWERED, payload: given }).pipe(
            Effect.andThen(Deferred.succeed(one.reply, answer)),
            Effect.andThen(drop(id)),
          );
        }),
      clear: Effect.suspend(() => {
        const all = [...asked.values()];
        asked.clear();
        return Effect.forEach(all, (one) => Deferred.succeed(one.reply, null), {
          discard: true,
        }).pipe(Effect.andThen(SubscriptionRef.set(list, [])));
      }),
    };
  });
