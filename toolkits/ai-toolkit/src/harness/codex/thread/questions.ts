import type { Schema, Scope } from 'effect';
import { Effect, Queue, Stream, SubscriptionRef } from 'effect';
import {
  QuestionNotAsked,
  type AgentQuestion,
  type QuestionAnswer,
  type RawOut,
} from '../../contract/index.js';
import {
  isNotification,
  type Notification,
  type QuestionRequest,
  type UserInputRequest,
  type UserInputResponse,
} from '../app-server/index.js';

/**
 * Codex keeps no item for a question it asks, so the harness records its
 * own: one when it is asked, its params as Codex sent them, and one when it
 * is answered, declined or dropped.
 */
export const QUESTION_ASKED = 'question.asked';
export const QUESTION_ANSWERED = 'question.answered';

/** What `question.answered` holds: null answers, it got none. */
export interface QuestionAnswered {
  readonly threadId: string;
  readonly turnId: string;
  readonly itemId: string;
  /** Each question's header, by its id, so the answers read on their own. */
  readonly headers: Readonly<Record<string, string>>;
  readonly answers: QuestionAnswer | null;
}

/** The Agent Question a request asks, by its tool call's item id. */
export const toQuestion = (
  request: UserInputRequest,
  now: number,
): AgentQuestion | undefined => {
  const [first, ...rest] = request.questions.map((question) => ({
    id: question.id,
    header: question.header,
    question: question.question,
    options: (question.options ?? []).map(({ label, description }) => ({
      label,
      description,
    })),
    // Codex asks for one choice, or an answer typed instead.
    multiSelect: false,
    other: question.isOther,
    secret: question.isSecret,
  }));
  return first === undefined
    ? undefined
    : { id: request.itemId, items: [first, ...rest], askedAt: now };
};

/**
 * The answers as the record keeps them: a secret's never written down, so
 * nothing that reads the record, the transcript included, can show it.
 */
const kept = (
  request: UserInputRequest,
  answer: QuestionAnswer | null,
): QuestionAnswer | null =>
  answer === null
    ? null
    : Object.fromEntries(
        Object.entries(answer).map(([id, answers]) => [
          id,
          request.questions.some((each) => each.id === id && each.isSecret)
            ? answers.map(() => SECRET)
            : answers,
        ]),
      );

/** What a secret answer is recorded as. */
export const SECRET = '(hidden)';

/** The response Codex reads: every question answered, with nothing if declined. */
export const toResponse = (
  request: UserInputRequest,
  answer: QuestionAnswer | null,
): UserInputResponse => ({
  answers: Object.fromEntries(
    request.questions.map((question) => [
      question.id,
      { answers: answer?.[question.id] ?? [] },
    ]),
  ),
});

export interface Questions {
  /**
   * Keeps a request the server offers while a Turn runs, and records it
   * asked; one asked between Turns has no Turn to wait and is left for the
   * server to decline.
   */
  readonly take: (request: QuestionRequest) => boolean;
  /** Drops one Codex settled on its own, as when its turn was interrupted. */
  readonly observe: (notification: Notification) => void;
  /** The current list first, then each change. */
  readonly changes: Stream.Stream<ReadonlyArray<AgentQuestion>>;
  readonly answer: (
    id: string,
    answer: QuestionAnswer | null,
  ) => Effect.Effect<void, QuestionNotAsked>;
  /**
   * Declines every one, as when their Turn ends; dropped without an answer
   * once Codex has exited.
   */
  readonly clear: (respond: boolean) => void;
}

interface Asked {
  readonly question: AgentQuestion;
  readonly request: QuestionRequest;
}

/**
 * The Agent Questions Codex waits on, each a `requestUserInput` request
 * held until the user answers. `emit` records each asked and answered, as
 * the agent its thread is, into the Turn running.
 */
export const makeQuestions = (
  emit: (out: RawOut) => void,
  agentOf: (threadId: string) => string | undefined,
  running: () => boolean,
): Effect.Effect<Questions, never, Scope.Scope> =>
  Effect.gen(function* () {
    const list = yield* SubscriptionRef.make<ReadonlyArray<AgentQuestion>>([]);
    const asked = new Map<string, Asked>();
    const changed = yield* Queue.sliding<void>(1);

    const current = Effect.suspend(() =>
      SubscriptionRef.set(
        list,
        [...asked.values()].map((one) => one.question),
      ),
    );
    // The server's reader runs outside any fiber: it marks a change, and
    // this fiber sets the list as it then stands.
    yield* Queue.take(changed).pipe(
      Effect.andThen(current),
      Effect.forever,
      Effect.forkScoped,
    );
    const publish = () => {
      Queue.offerUnsafe(changed, undefined);
    };

    const record = (kind: string, threadId: string, payload: unknown) => {
      const agentId = agentOf(threadId);
      const out = { kind, payload: payload as Schema.Json };
      emit(agentId === undefined ? out : { ...out, agentId });
    };

    /** Takes one off the list, answering Codex unless it settled it. */
    const settle = (
      one: Asked,
      answer: QuestionAnswer | null,
      respond: boolean,
    ) => {
      asked.delete(one.question.id);
      const { params } = one.request;
      if (respond) one.request.respond(toResponse(params, answer));
      record(QUESTION_ANSWERED, params.threadId, {
        threadId: params.threadId,
        turnId: params.turnId,
        itemId: params.itemId,
        headers: Object.fromEntries(
          params.questions.map((question) => [question.id, question.header]),
        ),
        answers: kept(params, answer),
      } satisfies QuestionAnswered);
    };

    return {
      take: (request) => {
        if (!running()) return false;
        const question = toQuestion(request.params, Date.now());
        if (question === undefined) return false;
        asked.set(question.id, { question, request });
        record(QUESTION_ASKED, request.params.threadId, request.params);
        publish();
        return true;
      },
      observe: (notification) => {
        if (!isNotification(notification, 'serverRequest/resolved')) return;
        const { requestId } = notification.params;
        for (const one of asked.values())
          if (one.request.id === requestId) {
            settle(one, null, false);
            publish();
          }
      },
      changes: SubscriptionRef.changes(list),
      answer: (id, answer) =>
        Effect.suspend(() => {
          const one = asked.get(id);
          if (one === undefined)
            return Effect.fail(new QuestionNotAsked({ id }));
          settle(one, answer, true);
          return current;
        }),
      clear: (respond) => {
        if (asked.size === 0) return;
        for (const one of asked.values()) settle(one, null, respond);
        publish();
      },
    };
  });
