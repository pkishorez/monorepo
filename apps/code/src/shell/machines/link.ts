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

type Machine = typeof MachineSchema.Type;

/*
 * The Machines of the signed-in Account, for any page under the root: the
 * root page Provides `Machines.layer`, and the Machine List of the Account
 * signed in publishes what it holds there and hears what pages ask, as the
 * Web Platform's Account Switcher does with `CurrentAccount`.
 */

/** What is known of the Account's Machines now. */
export interface Known {
  /** Whose Machines; null while nobody is signed in. */
  readonly accountId: string | null;
  /** The list, saved or fetched; null before either. */
  readonly machines: ReadonlyArray<Machine> | null;
  /** When the Backend last answered, epoch ms; null before it has. */
  readonly fetchedAt: number | null;
  /** Why the last ask failed, until one does not. */
  readonly problem: string | null;
  /** The Machine being Forgotten, and why it failed, if it did. */
  readonly forgetting: {
    readonly id: string;
    readonly problem: string | null;
  } | null;
}

export const nobody: Known = {
  accountId: null,
  machines: null,
  fetchedAt: null,
  problem: null,
  forgetting: null,
};

/** What a page may ask for, as the Messages it becomes. */
export type Request =
  | { readonly _tag: 'Refresh' }
  | { readonly _tag: 'Forget'; readonly id: string }
  | { readonly _tag: 'KeepForgetting' };

/** Between the root page's Provides and the Machine List under it. */
export class Link extends Context.Service<
  Link,
  {
    readonly known: SubscriptionRef.SubscriptionRef<Known>;
    readonly asked: Queue.Queue<Request>;
  }
>()('code/MachinesLink') {}

/** The signed-in Account's Machines: what is known, and asking for more. */
export class Machines extends Context.Service<
  Machines,
  {
    /** What is known now, then each change. */
    readonly state: Stream.Stream<Known>;
    readonly current: Effect.Effect<Known>;
    /** The Machine as listed now, then each change; null while it is not. */
    readonly machine: (id: string) => Stream.Stream<Machine | null>;
    /** The Machine once it is listed with an address; waits until it is. */
    readonly reachable: (id: string) => Effect.Effect<Machine>;
    readonly refresh: Effect.Effect<void>;
    /** Forgets the Machine for good, and its records on this device. */
    readonly forget: (id: string) => Effect.Effect<void>;
    /** Done with a Forget that failed. */
    readonly keepForgetting: Effect.Effect<void>;
  }
>()('code/Machines') {
  static readonly layer: Layer.Layer<Machines | Link> = Layer.effectContext(
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
      return Context.make(Link, { known, asked }).pipe(
        Context.add(Machines, {
          state,
          current: SubscriptionRef.get(known),
          machine,
          reachable: (id) =>
            machine(id).pipe(
              Stream.filter((each) => each !== null && each.url !== null),
              Stream.runHead,
              Effect.flatMap(
                Option.match({
                  onNone: () => Effect.never,
                  onSome: (each) => Effect.succeed(each as Machine),
                }),
              ),
            ),
          refresh: ask({ _tag: 'Refresh' }),
          forget: (id) => ask({ _tag: 'Forget', id }),
          keepForgetting: ask({ _tag: 'KeepForgetting' }),
        }),
      );
    }),
  );
}
