import { Deferred, Effect, Fiber, Layer, Queue, Stream } from 'effect';
import {
  CodexError,
  type Method,
  type Params,
  type RequestId,
  type Result,
  type ThreadStartResponse,
  type Turn,
  type TurnStartParams,
} from '../contract/index.ts';
import { Driver, type Connection, type Message } from '../shared/index.ts';
import type { Answers, Recording, Step } from './recordings/index.ts';

export interface Options {
  readonly recordings: Readonly<Record<string, Recording>>;
  readonly answers: Answers;
}

const turnOf = (id: string, status: Turn['status']): Turn => ({
  id,
  rootTurnId: id,
  items: [],
  itemsView: 'notLoaded',
  status,
  error: null,
  startedAt: null,
  completedAt: null,
  durationMs: null,
});

const choose = (options: Options, params: TurnStartParams) => {
  const first = params.input[0];
  const named =
    first?.type === 'text' ? options.recordings[first.text] : undefined;
  const recording = named ?? Object.values(options.recordings)[0];
  return recording === undefined
    ? Effect.fail(
        new CodexError({ message: 'The fake Codex has no recordings' }),
      )
    : Effect.succeed(recording);
};

const isSteerEcho = (step: Message) =>
  step.method === 'item/completed' || step.method === 'item/started'
    ? step.params.item.type === 'userMessage' &&
      step.params.item.clientId !== null
    : false;

const start = (options: Options) => () =>
  Effect.gen(function* () {
    const messages = yield* Queue.unbounded<Message, CodexError>();
    const waiting = new Map<RequestId, Deferred.Deferred<void>>();
    let threadId = '';
    let turn:
      | { readonly id: string; readonly replay: Fiber.Fiber<void> }
      | undefined;
    let exited: CodexError | undefined;

    const offer = (message: Message) => Queue.offer(messages, message);

    const thread = (id: string) =>
      Effect.gen(function* () {
        const answer = options.answers['thread/start'];
        if (answer === undefined)
          return yield* new CodexError({
            message: 'The fake Codex has no thread/start answer',
          });
        threadId = id;
        return {
          ...answer,
          thread: { ...answer.thread, id },
        } satisfies ThreadStartResponse;
      });

    const replay = (recording: Recording, turnId: string) =>
      Effect.gen(function* () {
        const steps = JSON.parse(
          JSON.stringify(recording.messages)
            .replaceAll(recording.thread, threadId)
            .replaceAll(recording.turn, turnId),
        ) as ReadonlyArray<Step>;
        const asked: Array<Deferred.Deferred<void>> = [];
        for (const step of steps) {
          yield* Effect.yieldNow;
          if ('exit' in step) {
            exited = new CodexError({ message: step.exit });
            yield* Queue.fail(messages, exited);
            return;
          }
          if (isSteerEcho(step)) continue;
          if ('id' in step) {
            const answered = yield* Deferred.make<void>();
            waiting.set(step.id, answered);
            asked.push(answered);
            yield* offer(step);
            continue;
          }
          for (const answered of asked.splice(0))
            yield* Deferred.await(answered);
          yield* offer(step);
        }
        turn = undefined;
      });

    const request = <M extends Method>(
      method: M,
      params: Params<M>,
    ): Effect.Effect<Result<M>, CodexError> =>
      Effect.gen(function* () {
        if (exited !== undefined) return yield* exited;
        switch (method) {
          case 'thread/start':
          case 'thread/fork':
            return yield* thread(crypto.randomUUID());
          case 'thread/resume':
            return yield* thread((params as Params<'thread/resume'>).threadId);
          case 'turn/start': {
            const recording = yield* choose(
              options,
              params as Params<'turn/start'>,
            );
            const id = crypto.randomUUID();
            turn = {
              id,
              replay: yield* Effect.forkDetach(replay(recording, id)),
            };
            return { turn: turnOf(id, 'inProgress') };
          }
          case 'turn/steer': {
            const steer = params as Params<'turn/steer'>;
            if (turn === undefined || turn.id !== steer.expectedTurnId)
              return yield* new CodexError({
                message: 'codex: no active turn to steer',
              });
            const item = {
              type: 'userMessage' as const,
              id: crypto.randomUUID(),
              clientId: steer.clientUserMessageId ?? null,
              content: steer.input,
            };
            const where = { threadId, turnId: turn.id };
            yield* offer({
              method: 'item/started',
              params: { item, ...where, startedAtMs: Date.now() },
            });
            yield* offer({
              method: 'item/completed',
              params: { item, ...where, completedAtMs: Date.now() },
            });
            return { turnId: turn.id };
          }
          case 'turn/interrupt': {
            const running = turn;
            if (running === undefined) return {};
            turn = undefined;
            yield* Fiber.interrupt(running.replay);
            for (const requestId of waiting.keys())
              yield* offer({
                method: 'serverRequest/resolved',
                params: { threadId, requestId },
              });
            waiting.clear();
            yield* offer({
              method: 'turn/completed',
              params: { threadId, turn: turnOf(running.id, 'interrupted') },
            });
            return {};
          }
          default: {
            const answer = options.answers[method];
            if (answer === undefined)
              return yield* new CodexError({
                message: `The fake Codex has no answer for ${method}`,
              });
            return answer;
          }
        }
      }) as Effect.Effect<Result<M>, CodexError>;

    yield* Effect.addFinalizer(() =>
      turn === undefined ? Effect.void : Fiber.interrupt(turn.replay),
    );

    return {
      request,
      respond: (id) =>
        Effect.suspend(() => {
          const answered = waiting.get(id);
          waiting.delete(id);
          return answered === undefined
            ? Effect.void
            : Deferred.succeed(answered, undefined);
        }),
      messages: Stream.fromQueue(messages),
    } satisfies Connection;
  });

export const layer = (options: Options) =>
  Layer.succeed(Driver, Driver.of({ start: start(options) }));
