import { OpenCode as Sdk } from '@opencode/sdk/effect';
import {
  type Cause,
  Deferred,
  Effect,
  Layer,
  Queue,
  type Scope,
  Stream,
} from 'effect';
import {
  type Client,
  type Event,
  type FormCreated,
  type HostOptions,
  OpenCodeError,
  type PermissionAsked,
  type SessionID,
  type UserMessage,
} from '../contract/index.js';
import { Driver, sessionOf } from '../shared/index.js';

const messageOf = (cause: unknown): string =>
  cause instanceof Error && cause.message !== ''
    ? cause.message
    : typeof cause === 'object' && cause !== null && '_tag' in cause
      ? String(cause._tag)
      : String(cause);

export const toError = (cause: unknown) =>
  new OpenCodeError({ message: messageOf(cause), cause });

const lift =
  <A extends ReadonlyArray<unknown>, R>(
    call: (...args: A) => Effect.Effect<R, unknown, never>,
  ) =>
  (...args: A) =>
    call(...args).pipe(Effect.mapError(toError));

const events = (client: Client, id: SessionID) =>
  Effect.gen(function* () {
    const queue = yield* Queue.unbounded<Event, OpenCodeError | Cause.Done>();
    const connected = yield* Deferred.make<void, OpenCodeError>();
    const subscription: Stream.Stream<Event, unknown> =
      client.event.subscribe();
    yield* subscription.pipe(
      Stream.runForEach((event: Event) =>
        event.type === 'server.connected'
          ? Deferred.succeed(connected, undefined)
          : sessionOf(event) === id
            ? Queue.offer(queue, event)
            : Effect.void,
      ),
      Effect.matchEffect({
        onFailure: (cause) =>
          Deferred.fail(connected, toError(cause)).pipe(
            Effect.andThen(Queue.fail(queue, toError(cause))),
          ),
        onSuccess: () =>
          Deferred.fail(
            connected,
            new OpenCodeError({
              message: 'OpenCode closed its event stream before connecting',
            }),
          ).pipe(Effect.andThen(Queue.end(queue))),
      }),
      Effect.forkScoped,
    );
    yield* Deferred.await(connected);
    return Stream.fromQueue(queue);
  });

export const layerReal = (options: HostOptions) =>
  Layer.effect(
    Driver,
    Effect.gen(function* () {
      const host: Effect.Effect<Client, unknown, Scope.Scope> =
        Sdk.create(options);
      const client = yield* host.pipe(Effect.mapError(toError));
      const prompt: (
        input: Parameters<Client['session']['prompt']>[0],
      ) => Effect.Effect<UserMessage, unknown> = client.session.prompt;
      return Driver.of({
        create: lift(client.session.create),
        fork: lift(client.session.fork),
        events: (id) => events(client, id),
        prompt: (id, input, delivery) =>
          lift(prompt)({ ...input, sessionID: id, delivery }),
        interrupt: (id) =>
          lift(client.session.interrupt)({ sessionID: id }).pipe(Effect.asVoid),
        reply: (id, requestId, answer) =>
          'decision' in answer
            ? lift(client.permission.reply)({
                ...answer,
                sessionID: id,
                requestID: requestId as PermissionAsked['data']['id'],
              })
            : lift(client.session.form.reply)({
                ...answer,
                sessionID: id,
                formID: requestId as FormCreated['data']['form']['id'],
              }),
        methods: {
          sessions: lift(client.session.list),
          session: lift(client.session.get),
          messages: lift(client.message.list),
          message: lift(client.session.message.get),
          context: lift(client.session.context),
          diff: lift(client.session.diff),
          compact: lift(client.session.compact),
          revert: lift(client.session.revert.stage),
          unrevert: lift(client.session.revert.clear),
          commitRevert: lift(client.session.revert.commit),
          update: lift(client.session.update),
          remove: lift(client.session.remove),
          switchModel: lift(client.session.switchModel),
          switchAgent: lift(client.session.switchAgent),
          permissions: lift(client.permission.list),
          forms: lift(client.session.form.list),
          providers: lift(client.provider.list),
          models: lift(client.model.list),
          defaultModel: lift(client.model.default),
          agents: lift(client.agent.list),
          commands: lift(client.command.list),
          skills: lift(client.skill.list),
          config: lift(client.config.get),
          mcp: lift(client.mcp.list),
          usageLimits: lift(client.usage.limits),
        },
        client: Effect.succeed(client),
      });
    }),
  );
