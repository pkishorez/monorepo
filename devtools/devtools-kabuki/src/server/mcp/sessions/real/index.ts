import { Cause, Effect, Layer, Option, Stream } from 'effect';
import { McpServer } from 'effect/ai';
import { RpcClientError } from 'effect/rpc';
import type { TabClient } from '../../../rpc/contract/index.ts';
import {
  type Entry,
  InstanceNotFound,
  type Node,
  type Step,
  StepNotFound,
  type Stepped,
} from '../../../rpc/session/contract/index.ts';
import { KabukiSessionNotFound } from '../../../rpc/sessions/contract/index.ts';
import { Registry } from '../../../services/registry/contract/index.ts';
import { SessionsTools } from '../contract/index.ts';
import { chainsOf } from './chains.ts';
import { changesOf, drawn, knownOf } from './details.ts';
import {
  type Held,
  branchOf,
  changedSince,
  heldOf,
  lineThrough,
} from './held.ts';
import { failedLine, failuresOf, lookOf, problemsOf } from './look.ts';
import { type NameOf, addressOf, nameOf, namesOf } from './names.ts';
import { settle } from './settle.ts';
import { named } from './signature.ts';
import { chainOf, stepOf } from './step.ts';
import { field, seconds } from './text.ts';
import { linesOf, timelineOf } from './timeline.ts';

const AFTER = 10;

const every = (node: Node): ReadonlyArray<Node> => [
  node,
  ...node.children.flatMap(every),
];

const atOf = (at: Step | undefined) => (at === undefined ? {} : { at });

const stepNow = (client: TabClient) =>
  client.step({}).pipe(Effect.catchTag('StepNotFound', Effect.die));

const looksOf = (
  client: TabClient,
  { at }: Stepped,
  addresses: ReadonlyArray<string>,
) =>
  Effect.forEach(
    addresses,
    (address) =>
      client
        .look({ at, address })
        .pipe(Effect.catchTag('InstanceNotFound', Effect.die)),
    { concurrency: 'unbounded' },
  );

const modelsOf = (client: TabClient, stepped: Stepped) =>
  Effect.map(
    looksOf(
      client,
      stepped,
      every(stepped.tree).map(({ address }) => address),
    ),
    (looks) =>
      Object.fromEntries(looks.map(({ address, model }) => [address, model])),
  );

const addressesOf = (
  { tree, at }: Stepped,
  given: ReadonlyArray<string>,
): Effect.Effect<ReadonlyArray<string>, InstanceNotFound> => {
  const names = namesOf(tree);
  return Effect.forEach(given, (one) => {
    const address = addressOf(names, one);
    return address === undefined
      ? Effect.fail(
          new InstanceNotFound({
            instance: one,
            at,
            available: names.map(({ name }) => name),
          }),
        )
      : Effect.succeed(address);
  });
};

const pastAddress = (
  line: ReadonlyArray<Entry>,
  name: NameOf,
  given: string,
) => {
  const addresses = new Set(
    line.flatMap(({ to, from }) =>
      from.kind === 'outside' ? [to] : [to, from.instance],
    ),
  );
  return [...addresses].find(
    (address) =>
      address === given || name(address).toLowerCase() === given.toLowerCase(),
  );
};

const newSince = (held: Held, after: number | null) =>
  chainsOf(branchOf(held).filter(({ id }) => after === null || id > after));

const fromDevtools = (address: string) => (entry: Entry) =>
  entry.to === address &&
  entry.from.kind === 'outside' &&
  entry.from.name === 'devtools';

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
      ) => Effect.Effect<
        A,
        E | KabukiSessionNotFound | RpcClientError.RpcClientError
      >,
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
    const historyOf = (name: string, client: TabClient) =>
      Effect.flatMap(
        heldOf(client),
        Option.match({ onNone: () => gone(name), onSome: Effect.succeed }),
      );
    const looked = (client: TabClient, at?: Step) =>
      Effect.gen(function* () {
        const stepped = yield* client.step(atOf(at));
        const models = yield* modelsOf(client, stepped);
        return lookOf({ stepped, models, opened: [] }, nameOf(stepped.tree));
      });
    const settled = (
      name: string,
      client: TabClient,
      known: ReadonlySet<string>,
      start: Held,
    ) =>
      Effect.gen(function* () {
        const read = Effect.all([
          stepNow(client),
          historyOf(name, client),
        ]).pipe(
          Effect.map(([stepped, held]) => ({
            stepped,
            changed: changedSince(held, start.newest),
          })),
        );
        const settling = yield* settle(read, known);
        const after = yield* historyOf(name, client);
        return { start, settling, after };
      });
    const followed = (
      client: TabClient,
      sent: string,
      address: string | undefined,
      { start, settling, after }: Effect.Success<ReturnType<typeof settled>>,
    ) =>
      drawn(client, after, (details) => {
        const chains = newSince(after, start.newest);
        const name = nameOf(settling.stepped.tree, changesOf(details));
        const begun =
          address === undefined
            ? undefined
            : chains.find((chain) => chain.entries.some(fromDevtools(address)));
        const rest = chains.filter((chain) => chain !== begun);
        const { lines, shown, wanted } = linesOf(rest, name, AFTER, details);
        const step =
          begun === undefined ? undefined : stepOf(begun, name, details);
        const still =
          settling.stepped.work === undefined
            ? []
            : problemsOf(settling.stepped.work, name);
        return {
          drawn: [
            `${sent} · ${settling.settled ? `settled in ${seconds(settling.waited)}` : settling.failed.length > 0 ? `a failure after ${seconds(settling.waited)}` : `not settled after ${seconds(settling.waited)}`}`,
            ...(address === undefined
              ? []
              : step === undefined
                ? ['no Step was recorded for it']
                : [step.drawn]),
            ...(lines.length === 0
              ? []
              : [
                  address === undefined ? 'Chains after it:' : 'then:',
                  ...lines.map((line) => `  ${line}`),
                  ...(shown.length < rest.length
                    ? [
                        `  … ${rest.length - shown.length} more: kabuki_timeline`,
                      ]
                    : []),
                ]),
            ...(settling.failed.length === 0
              ? []
              : [
                  'new failures:',
                  ...settling.failed.map((one) => `  ${failedLine(one, name)}`),
                ]),
            ...(settling.settled ||
            settling.failed.length > 0 ||
            still.length === 0
              ? []
              : ['problems at the head:', ...still.map((one) => `  ${one}`)]),
          ].join('\n'),
          wanted: [...wanted, ...(step?.wanted ?? [])],
        };
      });

    return {
      kabuki_sessions: () =>
        Effect.map(registry.list, (sessions) =>
          sessions.length === 0
            ? 'no Kabuki app is connected'
            : sessions
                .map(({ name, app, url }) =>
                  [name, app, url].filter((one) => one !== '').join('  '),
                )
                .join('\n'),
        ),
      kabuki_look: ({ session, at, open = [] }) =>
        on(session, (client) =>
          Effect.gen(function* () {
            if (open.length === 0) return yield* looked(client, at);
            const stepped = yield* client.step(atOf(at));
            const addresses = yield* addressesOf(stepped, open);
            const opened = yield* looksOf(client, stepped, addresses);
            return lookOf(
              { stepped, models: {}, opened },
              nameOf(stepped.tree),
            );
          }),
        ),
      kabuki_timeline: ({ session, instance, ...filter }) =>
        on(session, (client) =>
          Effect.gen(function* () {
            const [held, now] = yield* Effect.all([
              historyOf(session, client),
              stepNow(client),
            ]);
            const line = branchOf(held);
            const address =
              instance === undefined
                ? undefined
                : (addressOf(namesOf(now.tree), instance) ??
                  pastAddress(
                    line,
                    nameOf(now.tree, changesOf(knownOf(client, held))),
                    instance,
                  ));
            if (instance !== undefined && address === undefined)
              return yield* new InstanceNotFound({
                instance,
                at: now.at,
                available: namesOf(now.tree).map(({ name: one }) => one),
              });
            return yield* drawn(client, held, (details) =>
              timelineOf(
                held.now,
                line,
                {
                  ...filter,
                  ...(address === undefined ? {} : { instance: address }),
                },
                nameOf(now.tree, changesOf(details)),
                details,
              ),
            );
          }),
        ),
      kabuki_step: ({ session, id }) =>
        on(session, (client) =>
          Effect.gen(function* () {
            const [held, now] = yield* Effect.all([
              historyOf(session, client),
              stepNow(client),
            ]);
            const chain = chainOf(chainsOf(lineThrough(held, id)), id);
            if (chain === undefined) {
              const ids = [...held.entries.keys()];
              return yield* new StepNotFound({
                step: id,
                oldest: ids.length === 0 ? null : Math.min(...ids),
                newest: ids.length === 0 ? null : Math.max(...ids),
              });
            }
            const last = chain.entries.at(-1)!;
            const step = yield* drawn(client, held, (details) =>
              stepOf(chain, nameOf(now.tree, changesOf(details)), details),
            );
            return [step, `the tree after it: kabuki_look at: ${last.id}`].join(
              '\n',
            );
          }),
        ),
      kabuki_send: ({ session, to, message }) =>
        on(session, (client) =>
          Effect.gen(function* () {
            const now = yield* stepNow(client);
            const [address] = yield* addressesOf(now, [to]);
            const start = yield* historyOf(session, client);
            const sent = yield* client.send({ to: address!, message });
            const after = yield* settled(
              session,
              client,
              failuresOf(now.work),
              start,
            );
            return yield* followed(client, `${sent}`, address, after);
          }).pipe(
            Effect.catchIf(
              (error): error is InstanceNotFound =>
                error instanceof InstanceNotFound,
              ({ at }) =>
                Effect.flatMap(stepNow(client), (now) =>
                  Effect.fail(
                    new InstanceNotFound({
                      instance: to,
                      at,
                      available: namesOf(now.tree).map(({ name }) => name),
                    }),
                  ),
                ),
            ),
          ),
        ),
      kabuki_travel: ({ session, to }) =>
        on(session, (client) =>
          Effect.gen(function* () {
            yield* client.preview({ at: to });
            const look = yield* looked(client, to ?? undefined);
            return to === null
              ? `back at the head\n${look}`
              : `showing step ${to}; kabuki_travel to: null comes back\n${look}`;
          }),
        ),
      kabuki_fork: ({ session, from }) =>
        on(session, (client) =>
          Effect.gen(function* () {
            const before = yield* stepNow(client);
            const start = yield* historyOf(session, client);
            yield* client.fork({ from });
            const { settling } = yield* settled(
              session,
              client,
              failuresOf(before.work),
              start,
            );
            const look = yield* looked(client);
            return [
              `forked at ${from}; the app carries on from there · ${settling.settled ? 'settled' : 'not settled'} after ${seconds(settling.waited)}`,
              look,
            ].join('\n');
          }),
        ),
      kabuki_fakes: ({ session, fake }) =>
        on(session, (client) => Stream.runHead(client.world())).pipe(
          Effect.flatMap(
            Option.match({
              onNone: () => gone(session),
              onSome: (fakes) => {
                const shown = fakes.filter(
                  (one) => fake === undefined || one.name === fake,
                );
                return Effect.succeed(
                  shown.length === 0
                    ? `no Fake${fake === undefined ? '' : ` named ${fake}`}; there are: ${fakes.map(({ name }) => name).join(', ') || 'none'}`
                    : shown
                        .map(({ name, value, controls }) =>
                          [
                            `fake ${name}`,
                            field('state', value, 1),
                            ...controls.map(
                              ({ name: control, payload, description }) =>
                                `  ${named({
                                  name: control,
                                  shape: payload,
                                  ...(description === undefined
                                    ? {}
                                    : { description }),
                                })}`,
                            ),
                          ].join('\n'),
                        )
                        .join('\n'),
                );
              },
            }),
          ),
        ),
      kabuki_control: ({ session, ...asked }) =>
        on(session, (client) =>
          Effect.gen(function* () {
            const now = yield* stepNow(client);
            const start = yield* historyOf(session, client);
            yield* client.control(asked);
            const after = yield* settled(
              session,
              client,
              failuresOf(now.work),
              start,
            );
            return yield* followed(
              client,
              `${asked.fake}.${asked.control}: done`,
              undefined,
              after,
            );
          }),
        ),
    };
  }),
);

const text = (one: string) => [{ type: 'text' as const, text: one }];

export const sessionsTools = McpServer.toolkit(SessionsTools, {
  content: {
    kabuki_sessions: text,
    kabuki_look: text,
    kabuki_timeline: text,
    kabuki_step: text,
    kabuki_send: text,
    kabuki_travel: text,
    kabuki_fork: text,
    kabuki_fakes: text,
    kabuki_control: text,
  },
}).pipe(Layer.provide(handlers));
