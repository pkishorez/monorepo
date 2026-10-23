import {
  Context,
  Effect,
  Layer,
  Option,
  Queue,
  Stream,
  SubscriptionRef,
} from 'effect';
import type { Machine as MachineSchema } from '@kestack/ai-toolkit/machines';
import {
  type Known,
  Link,
  Machines,
  nobody,
  type Request,
} from '../capabilities/index.ts';
import { addressOf, socketUrl } from '../machine-health/index.ts';

type Machine = typeof MachineSchema.Type;

/** The Machines, as the Machines actor publishes them. */
export const layer: Layer.Layer<Machines | Link> = Layer.effectContext(
  Effect.gen(function* () {
    const known = yield* SubscriptionRef.make<Known>(nobody);
    const asked = yield* Queue.unbounded<Request>();
    const ask = (request: Request) =>
      Effect.asVoid(Queue.offer(asked, request));
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
    const speech = (id: string) =>
      state.pipe(
        Stream.map(({ speech }) => speech[id] ?? null),
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
    return Context.make(Link, { known, asked }).pipe(
      Context.add(Machines, {
        state,
        current: SubscriptionRef.get(known),
        machine,
        line,
        speech,
        listed: (id) => Effect.asVoid(first(id, () => true)),
        reachable: (id) =>
          first(id, ({ status, key }) => {
            const socket = socketUrl(addressOf(status));
            return socket === null ? null : { socket, key };
          }),
        reload: ask({ _tag: 'ReloadAsked' }),
        forget: (id) => ask({ _tag: 'ForgetAsked', id }),
        keepForgetting: ask({ _tag: 'ForgetDismissed' }),
      }),
    );
  }),
);
