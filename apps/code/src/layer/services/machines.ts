import {
  Context,
  Effect,
  Layer,
  Option,
  PubSub,
  Queue,
  Stream,
  SubscriptionRef,
} from 'effect';
import type { Machine as MachineSchema } from '@kestack/connect/code';
import {
  addressOf,
  type KitRequest,
  type Known,
  Link,
  Machines,
  nobody,
  type Request,
  socketUrl,
} from '../capabilities/index.ts';

type Machine = typeof MachineSchema.Type;

/** The Machines, as the Machine List and its Kits publish them. */
export const layer: Layer.Layer<Machines | Link> = Layer.effectContext(
  Effect.gen(function* () {
    const known = yield* SubscriptionRef.make<Known>(nobody);
    const asked = yield* Queue.unbounded<Request>();
    const kitsAsked = yield* PubSub.unbounded<KitRequest>();
    const ask = (request: Request) =>
      Effect.asVoid(Queue.offer(asked, request));
    const askKits = (request: KitRequest) =>
      Effect.asVoid(PubSub.publish(kitsAsked, request));
    const state = SubscriptionRef.changes(known);
    const machine = (id: string) =>
      state.pipe(
        Stream.map(
          ({ machines }) => machines?.find((each) => each.id === id) ?? null,
        ),
        Stream.changes,
      );
    const line = (id: string) =>
      state.pipe(
        Stream.map(({ lines }) => lines[id] ?? 'connecting'),
        Stream.changes,
      );
    const kit = (id: string) =>
      state.pipe(
        Stream.map(({ kits }) => kits[id] ?? null),
        Stream.changes,
      );
    /** The first `found` of the Machine as listed; waits for one, for ever if need be. */
    const first = <A>(id: string, found: (machine: Machine) => A | null) =>
      machine(id).pipe(
        Stream.map((each) => (each === null ? null : found(each))),
        Stream.filter((each): each is A => each !== null),
        Stream.runHead,
        Effect.flatMap(
          Option.match({
            onNone: () => Effect.never,
            onSome: Effect.succeed,
          }),
        ),
      );
    return Context.make(Link, { known, asked, kitsAsked }).pipe(
      Context.add(Machines, {
        state,
        current: SubscriptionRef.get(known),
        account: state.pipe(
          Stream.map(({ accountId }) => accountId),
          Stream.filter((id) => id !== null),
          Stream.runHead,
          Effect.flatMap(
            Option.match({
              onNone: () => Effect.never,
              onSome: Effect.succeed,
            }),
          ),
        ),
        machine,
        line,
        kit,
        refresh: (id) => askKits({ machineId: id, ask: { _tag: 'Asked' } }),
        changed: (id, change) => askKits({ machineId: id, ask: change }),
        listed: (id) => Effect.asVoid(first(id, () => true)),
        reachable: (id) =>
          first(id, ({ status, key }) => {
            const socket = socketUrl(addressOf(status));
            return socket === null ? null : { socket, key };
          }),
        reload: Effect.andThen(
          ask({ _tag: 'ReloadAsked' }),
          askKits({ machineId: null, ask: { _tag: 'Asked' } }),
        ),
        forget: (id) => ask({ _tag: 'ForgetAsked', id }),
        keepForgetting: ask({ _tag: 'ForgetDismissed' }),
      }),
    );
  }),
);
