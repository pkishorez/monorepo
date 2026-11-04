import { Effect, Schedule, Stream, SubscriptionRef } from 'effect';
import {
  CodeClient,
  CodeClients,
  type QuestionAnswer,
  type SessionQuestions,
} from '@kestack/connect/code';
import { keepSubscribed } from '@kestack/rpc-toolkit/rpc/websocket';
import { isSample, samples } from './samples.ts';

/*
 * The Agent Questions of one Connection: every Session's whose running Turn
 * waits on one, whole, then again on each change, over the Connection's own
 * socket; a feed it refuses is tried again a little later. Its Connection
 * follows it and says it in `Connections`, for the sidebar's marks and the
 * open session's Question Panel.
 *
 * In development, a session's address with `?question=` adds a sample to
 * that session's (`samples.ts`), answered here and never sent.
 */

/** Every Session's Agent Questions on a Connection, now and on each change. */
export const questionsOn = (connectionId: string) =>
  Stream.zipLatest(
    CodeClients.stream(
      connectionId,
      keepSubscribed(() =>
        Stream.unwrap(Effect.map(CodeClient, (api) => api.agentQuestions())),
      ),
    ).pipe(
      Stream.retry(Schedule.spaced('5 seconds')),
      // Retried forever, so it never fails.
      Stream.orDie,
    ),
    SubscriptionRef.changes(samples),
  ).pipe(
    Stream.map(([asked, tried]): ReadonlyArray<SessionQuestions> => [
      ...asked,
      ...tried.filter((each) => each.connectionId === connectionId),
    ]),
  );

/**
 * Answers one of a Session's Agent Questions, or declines it with null,
 * over the socket its page Provides; a sample is answered here.
 */
export const answerQuestion = (args: {
  readonly sessionId: string;
  readonly questionId: string;
  readonly answer: QuestionAnswer | null;
}) =>
  isSample(args.questionId)
    ? Effect.sleep('600 millis').pipe(
        Effect.andThen(
          SubscriptionRef.update(samples, (now) =>
            now.filter(({ sessionId }) => sessionId !== args.sessionId),
          ),
        ),
      )
    : CodeClient.use((api) => api.answerQuestion(args));
