import { Cause, Effect, Layer, Option, Stream } from 'effect';
import { McpServer } from 'effect/ai';
import { RpcClientError } from 'effect/rpc';
import type { TabClient } from '../../../rpc/contract/index.ts';
import {
  type BlueprintNode,
  InstanceNotFound,
  type Look,
  type Step,
} from '../../../rpc/session/contract/index.ts';
import { KabukiSessionNotFound } from '../../../rpc/sessions/contract/index.ts';
import { Registry } from '../../../services/registry/contract/index.ts';
import { SessionsTools } from '../contract/index.ts';
import { lookOf, namesFor } from './look.ts';
import { addressOf, changesOf, namesOf } from './names.ts';
import { named } from './signature.ts';
import { timelineOf } from './timeline.ts';
import { changedOf, trimmed } from './trim.ts';

const QUIET = '300 millis';
const CHECKS = 10;

const lookAt = (client: TabClient, open: ReadonlyArray<string>, at?: Step) =>
  client.look({ open, whole: true, ...(at === undefined ? {} : { at }) });

const blueprints = new WeakMap<TabClient, BlueprintNode>();

const blueprintOf = (client: TabClient) => {
  const kept = blueprints.get(client);
  return kept === undefined
    ? Effect.map(client.blueprint(), ({ root }) => {
        blueprints.set(client, root);
        return root;
      })
    : Effect.succeed(kept);
};

const lookNow = (client: TabClient, open: ReadonlyArray<string>) =>
  lookAt(client, open).pipe(Effect.catchTag('StepNotFound', Effect.die));

const addressesOf = (
  look: Look,
  given: ReadonlyArray<string>,
): Effect.Effect<ReadonlyArray<string>, InstanceNotFound> => {
  const names = namesOf(look.root);
  return Effect.forEach(given, (one) => {
    const address = addressOf(names, one);
    return address === undefined
      ? Effect.fail(
          new InstanceNotFound({
            instance: one,
            at: look.at,
            available: names.map(({ name }) => name),
          }),
        )
      : Effect.succeed(address);
  });
};

const byName = <A, E>(
  client: TabClient,
  given: string,
  effect: Effect.Effect<A, E | InstanceNotFound>,
) =>
  effect.pipe(
    Effect.catchIf(
      (error): error is InstanceNotFound => error instanceof InstanceNotFound,
      ({ at }) =>
        Effect.flatMap(lookNow(client, []), (now) =>
          Effect.fail(
            new InstanceNotFound({
              instance: given,
              at,
              available: namesOf(now.root).map(({ name }) => name),
            }),
          ),
        ),
    ),
  );

const settled = (client: TabClient, open: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    let last = yield* lookNow(client, open);
    for (let check = 0; check < CHECKS; check++) {
      yield* Effect.sleep(QUIET);
      const now = yield* lookNow(client, open);
      if (now.at === last.at) return now;
      last = now;
    }
    return last;
  });

const afterwards = (
  before: Look,
  target: Look,
  after: Look,
  address?: string,
) => {
  const now = address === undefined ? undefined : target.opened[address];
  const model =
    now === undefined
      ? undefined
      : changedOf(before.opened[address!]?.model, now.model);
  const changes = changesOf(namesOf(before.root), namesOf(after.root));
  return {
    ...(model === undefined ? {} : { model }),
    ...(changes.length === 0 ? {} : { changes }),
  };
};

const handlers = SessionsTools.toLayer(
  Effect.gen(function* () {
    const registry = yield* Registry;
    const gone = (name: string) =>
      Effect.flatMap(registry.list, (sessions) =>
        Effect.fail(
          new KabukiSessionNotFound({
            name,
            available: sessions.map((one) => one.name),
          }),
        ),
      );
    const on = <A, E>(
      name: string,
      call: (
        client: TabClient,
      ) => Effect.Effect<A, E | RpcClientError.RpcClientError>,
    ) =>
      Effect.gen(function* () {
        const session = yield* registry.find(name);
        if (session === undefined) return yield* gone(name);
        return yield* call(session.client);
      }).pipe(
        Effect.catchIf(
          (error): error is RpcClientError.RpcClientError =>
            error instanceof RpcClientError.RpcClientError,
          () => gone(name),
        ),
        Effect.catchCause((cause) =>
          Cause.hasInterruptsOnly(cause) ? gone(name) : Effect.failCause(cause),
        ),
      );
    const firstOn = <A, E>(
      name: string,
      stream: (client: TabClient) => Stream.Stream<A, E>,
    ) =>
      on(name, (client) => Stream.runHead(stream(client))).pipe(
        Effect.flatMap(
          Option.match({ onNone: () => gone(name), onSome: Effect.succeed }),
        ),
      );

    return {
      kabuki_sessions: () =>
        Effect.map(registry.list, (sessions) => ({
          sessions: sessions.map(({ name, app, url }) => ({ name, app, url })),
        })),
      kabuki_look: ({ session, at, open = [] }) =>
        on(session, (client) =>
          Effect.gen(function* () {
            const tree = yield* lookAt(client, [], at);
            if (open.length === 0) return lookOf(tree, null);
            const addresses = yield* addressesOf(tree, open);
            const [look, blueprint] = yield* Effect.all([
              byName(client, open.join(', '), lookAt(client, addresses, at)),
              blueprintOf(client),
            ]);
            return lookOf(look, blueprint);
          }),
        ),
      kabuki_timeline: ({ session, before }) =>
        on(session, (client) =>
          Effect.all([
            Stream.runHead(client.watch()),
            lookNow(client, []).pipe(
              Effect.catchTag('InstanceNotFound', Effect.die),
            ),
          ]),
        ).pipe(
          Effect.flatMap(([watched, now]) =>
            Option.match(watched, {
              onNone: () => gone(session),
              onSome: (one) =>
                Effect.succeed(timelineOf(one, before, namesFor(now.root))),
            }),
          ),
        ),
      kabuki_send: ({ session, to, message }) =>
        on(session, (client) =>
          byName(
            client,
            to,
            Effect.gen(function* () {
              const [address] = yield* addressesOf(yield* lookNow(client, []), [
                to,
              ]);
              const before = yield* lookNow(client, [address!]);
              const sent = yield* client.send({ to: address!, message });
              const after = yield* settled(client, []);
              const target = yield* lookNow(client, [address!]).pipe(
                Effect.catchIf(
                  (error): error is InstanceNotFound =>
                    error instanceof InstanceNotFound,
                  () => Effect.succeed(after),
                ),
              );
              return { sent, ...afterwards(before, target, after, address) };
            }),
          ),
        ),
      kabuki_travel: ({ session, to }) =>
        on(session, (client) => client.travel({ to })).pipe(
          Effect.as({ at: to }),
        ),
      kabuki_fork: ({ session, from }) =>
        on(session, (client) => client.fork({ from })).pipe(
          Effect.as({ from }),
        ),
      kabuki_fakes: ({ session, fake }) =>
        firstOn(session, (client) => client.fakes()).pipe(
          Effect.map((fakes) => ({
            fakes: fakes
              .filter((one) => fake === undefined || one.name === fake)
              .map(({ name, value, controls }) => ({
                name,
                value: trimmed(value),
                controls: controls.map(
                  ({ name: control, payload, description }) =>
                    named({
                      name: control,
                      shape: payload,
                      ...(description === undefined ? {} : { description }),
                    }),
                ),
              })),
          })),
        ),
      kabuki_control: ({ session, ...asked }) =>
        on(session, (client) =>
          Effect.gen(function* () {
            const before = yield* lookNow(client, []).pipe(
              Effect.catchTag('InstanceNotFound', Effect.die),
            );
            yield* client.control(asked);
            const after = yield* settled(client, []).pipe(
              Effect.catchTag('InstanceNotFound', Effect.die),
            );
            return {
              done: true as const,
              ...afterwards(before, after, after),
            };
          }),
        ),
    };
  }),
);

export const sessionsTools = McpServer.toolkit(SessionsTools).pipe(
  Layer.provide(handlers),
);
