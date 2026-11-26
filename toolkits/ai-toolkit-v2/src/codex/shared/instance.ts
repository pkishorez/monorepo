import {
  Deferred,
  Effect,
  PubSub,
  Queue,
  type Scope,
  Stream,
  SubscriptionRef,
} from 'effect';
import {
  CodexError,
  type Answer,
  type Live,
  type Method,
  type Mode,
  type Params,
  type RequestId,
  type Result,
  type ServerNotification,
  type ServerRequest,
  type TurnInput,
  type TurnStatus,
} from '../contract/index.ts';
import type { Connection, Message } from './driver.ts';
import { Out } from './out.ts';

export interface Opened {
  readonly id: string;
  readonly cwd: string;
  readonly model: string;
}

export interface Instance {
  readonly id: string;
  readonly state: SubscriptionRef.SubscriptionRef<Live>;
  readonly gone: Deferred.Deferred<void>;
  readonly submit: (
    turn: TurnInput,
    release: Effect.Effect<void>,
    mode?: Mode,
  ) => Effect.Effect<Stream.Stream<Out>>;
  readonly respond: (
    requestId: RequestId,
    answer: Answer,
  ) => Effect.Effect<void, CodexError>;
  readonly cancel: Effect.Effect<void>;
  readonly request: <M extends Method>(
    method: M,
    params: Params<M>,
  ) => Effect.Effect<Result<M>, CodexError>;
}

interface Run {
  readonly input: TurnInput;
  readonly release: Effect.Effect<void>;
  readonly out: PubSub.PubSub<Out>;
  readonly ended: Deferred.Deferred<void>;
  readonly started: Deferred.Deferred<string, CodexError>;
  readonly steers: Set<string>;
  turnId?: string;
  cancelled: boolean;
  finished: boolean;
  result?: string;
}

const CANCEL_WAIT = '5 seconds';

const statuses: Record<TurnStatus, 'completed' | 'cancelled' | 'failed'> = {
  completed: 'completed',
  interrupted: 'cancelled',
  failed: 'failed',
  inProgress: 'failed',
};

const isRequest = (message: Message): message is ServerRequest =>
  'id' in message;

export const make = (
  connection: Connection,
  opened: Opened,
): Effect.Effect<Instance, never, Scope.Scope> =>
  Effect.gen(function* () {
    const { id } = opened;
    const state = yield* SubscriptionRef.make<Live>({
      id,
      status: 'ready',
      queue: 0,
      requests: [],
      cwd: opened.cwd,
      model: opened.model,
    });
    const gone = yield* Deferred.make<void>();
    const waiting = yield* Queue.unbounded<Run>();
    const pending = new Set<Run>();
    let current: Run | undefined;
    let requests: ReadonlyArray<ServerRequest> = [];
    let dead: CodexError | undefined;

    const show = Effect.suspend(() => {
      const turnId = current?.turnId;
      const live: Live = {
        id,
        status:
          current === undefined
            ? 'ready'
            : turnId === undefined
              ? 'starting'
              : 'running',
        queue: pending.size - (current === undefined ? 0 : 1),
        requests,
        ...(turnId === undefined ? {} : { turnId }),
        cwd: opened.cwd,
        model: opened.model,
      };
      return SubscriptionRef.set(state, live);
    });

    const publish = (run: Run, out: Out) => PubSub.publish(run.out, out);

    const finish = (run: Run, ended: Extract<Out, { _tag: 'Ended' }>) =>
      Effect.gen(function* () {
        if (run.finished) return;
        run.finished = true;
        yield* publish(run, ended);
        yield* Deferred.succeed(run.ended, undefined);
        yield* Deferred.fail(
          run.started,
          new CodexError({
            message: 'The Codex Run ended before its turn started',
          }),
        );
        pending.delete(run);
        if (current === run) current = undefined;
        yield* show;
        yield* Effect.forkDetach(run.release);
      });

    const die = (error: CodexError) =>
      Effect.gen(function* () {
        if (dead !== undefined) return;
        dead = error;
        requests = [];
        yield* show;
        for (const run of pending)
          yield* finish(run, Out.Ended({ status: 'failed', error }));
        yield* Deferred.succeed(gone, undefined);
      });

    const hear = (message: Message) =>
      Effect.gen(function* () {
        if (isRequest(message)) {
          requests = [...requests, message];
          yield* show;
          if (current !== undefined)
            yield* publish(current, Out.Requested({ request: message }));
          return;
        }
        if (message.method === 'serverRequest/resolved') {
          requests = requests.filter(
            (request) => request.id !== message.params.requestId,
          );
          yield* show;
        }
        const run = current;
        if (run === undefined) return;
        yield* publish(run, outOf(run, message));
        if (
          message.method === 'item/completed' &&
          message.params.threadId === id
        ) {
          const { item } = message.params;
          if (item.type === 'agentMessage') run.result = item.text;
        }
        if (
          message.method === 'turn/completed' &&
          message.params.threadId === id &&
          (run.turnId === undefined || run.turnId === message.params.turn.id)
        ) {
          const { turn } = message.params;
          yield* finish(
            run,
            Out.Ended({
              status: statuses[turn.status],
              at: turn.id,
              ...(run.result === undefined ? {} : { result: run.result }),
              ...(turn.error === null ? {} : { error: turn.error }),
            }),
          );
        }
      });

    const outOf = (run: Run, message: ServerNotification): Out => {
      if (message.method === 'item/completed') {
        const { item } = message.params;
        if (
          item.type === 'userMessage' &&
          item.clientId !== null &&
          run.steers.delete(item.clientId)
        )
          return Out.Steered({ message });
      }
      return Out.Record({ record: message });
    };

    const interrupt = (run: Run, turnId: string) =>
      Effect.gen(function* () {
        yield* connection
          .request('turn/interrupt', { threadId: id, turnId })
          .pipe(Effect.timeoutOption(CANCEL_WAIT), Effect.ignore);
        const ended = yield* Deferred.await(run.ended).pipe(
          Effect.timeoutOption(CANCEL_WAIT),
        );
        if (ended._tag === 'None')
          yield* finish(run, Out.Ended({ status: 'cancelled', at: turnId }));
      });

    const execute = (run: Run) =>
      Effect.gen(function* () {
        if (run.finished) return;
        current = run;
        yield* show;
        const answer = yield* connection
          .request('turn/start', { ...run.input, threadId: id })
          .pipe(Effect.result);
        if (answer._tag === 'Failure') {
          yield* Deferred.fail(run.started, answer.failure);
          return yield* finish(
            run,
            Out.Ended({ status: 'failed', error: answer.failure }),
          );
        }
        run.turnId = answer.success.turn.id;
        yield* Deferred.succeed(run.started, run.turnId);
        yield* show;
        if (run.cancelled) yield* interrupt(run, run.turnId);
        yield* Deferred.await(run.ended);
      });

    yield* connection.messages.pipe(
      Stream.runForEach(hear),
      Effect.flatMap(() =>
        die(new CodexError({ message: 'codex app-server stopped' })),
      ),
      Effect.catch(die),
      Effect.forkScoped,
    );
    yield* Queue.take(waiting).pipe(
      Effect.flatMap(execute),
      Effect.forever,
      Effect.forkScoped,
    );
    yield* Effect.addFinalizer(() =>
      die(new CodexError({ message: 'The Codex instance stopped' })),
    );

    const streamOf = (run: Run) =>
      Stream.fromPubSub(run.out).pipe(
        Stream.takeUntil((out) => out._tag === 'Ended'),
      );

    const queue = (turn: TurnInput, release: Effect.Effect<void>) =>
      Effect.gen(function* () {
        const run: Run = {
          input: turn,
          release,
          out: yield* PubSub.unbounded<Out>({
            replay: Number.MAX_SAFE_INTEGER,
          }),
          ended: yield* Deferred.make<void>(),
          started: yield* Deferred.make<string, CodexError>(),
          steers: new Set(),
          cancelled: false,
          finished: false,
        };
        const stream = streamOf(run);
        yield* publish(run, Out.Started({ id }));
        if (dead !== undefined) {
          yield* finish(run, Out.Ended({ status: 'failed', error: dead }));
          return stream;
        }
        if (pending.size > 0)
          yield* publish(run, Out.Queued({ position: pending.size }));
        pending.add(run);
        yield* Queue.offer(waiting, run);
        yield* show;
        return stream;
      });

    const joinable = (run: Run | undefined): run is Run =>
      run !== undefined && !run.cancelled && !run.finished;

    const join = (turn: TurnInput, release: Effect.Effect<void>) =>
      Effect.gen(function* () {
        const run = current;
        if (!joinable(run)) return undefined;
        const expectedTurnId = yield* Deferred.await(run.started).pipe(
          Effect.option,
        );
        if (expectedTurnId._tag === 'None' || !joinable(run)) return undefined;
        const clientUserMessageId =
          turn.clientUserMessageId ?? crypto.randomUUID();
        run.steers.add(clientUserMessageId);
        const steered = yield* connection
          .request('turn/steer', {
            threadId: id,
            expectedTurnId: expectedTurnId.value,
            clientUserMessageId,
            input: turn.input,
            ...(turn.responsesapiClientMetadata === undefined
              ? {}
              : {
                  responsesapiClientMetadata: turn.responsesapiClientMetadata,
                }),
            ...(turn.responsesapiClientMetadataPatch === undefined
              ? {}
              : {
                  responsesapiClientMetadataPatch:
                    turn.responsesapiClientMetadataPatch,
                }),
          })
          .pipe(Effect.option);
        if (steered._tag === 'None') {
          run.steers.delete(clientUserMessageId);
          return undefined;
        }
        yield* Deferred.await(run.ended).pipe(
          Effect.andThen(release),
          Effect.forkDetach,
        );
        return streamOf(run);
      });

    const submit = (
      turn: TurnInput,
      release: Effect.Effect<void>,
      mode: Mode = 'queue',
    ) =>
      Effect.gen(function* () {
        if (mode === 'steer') {
          const joined = yield* join(turn, release);
          if (joined !== undefined) return joined;
        }
        return yield* queue(turn, release);
      });

    const respond = (requestId: RequestId, answer: Answer) =>
      Effect.gen(function* () {
        if (!requests.some((request) => request.id === requestId))
          return yield* new CodexError({
            message: `No pending Codex request ${requestId} on ${id}`,
          });
        requests = requests.filter((request) => request.id !== requestId);
        yield* show;
        yield* connection.respond(requestId, answer);
      });

    const cancel = Effect.gen(function* () {
      const run = current;
      if (run === undefined) return;
      run.cancelled = true;
      if (run.turnId !== undefined) yield* interrupt(run, run.turnId);
    });

    return {
      id,
      state,
      gone,
      submit,
      respond,
      cancel,
      request: connection.request,
    } satisfies Instance;
  });
