import { Context } from 'effect';
import type { Effect, Queue, Stream, SubscriptionRef } from 'effect';
import type {
  Machine as MachineSchema,
  SpeechToTextState,
} from '@kestack/connect/code';

type Machine = typeof MachineSchema.Type;

/** A Machine's line, its socket, now. */
export type Line = 'connecting' | 'connected' | 'reconnecting';

/*
 * The Machines of the signed-in Account, for any Actor: the app Layer
 * gives it (`services/machines.ts`), and the Machines actor of the Account
 * signed in publishes what it holds there, each Machine's line and Speech
 * to Text too, and hears what others ask, as the Web Platform's Account
 * Switcher does with `CurrentAccount`.
 */

/** What is known of the Account's Machines now. */
export interface Known {
  /** Whose Machines; null while nobody is signed in. */
  readonly accountId: string | null;
  /** The list, saved or fetched; null before either. */
  readonly machines: ReadonlyArray<Machine> | null;
  /** Whether the list kept on this device has been read, kept or not. */
  readonly savedRead: boolean;
  /** When Cloud Connect last answered, epoch ms; null before it has. */
  readonly fetchedAt: number | null;
  /** Why the last ask failed, until one does not. */
  readonly problem: string | null;
  /** The Machine being Forgotten, and why it failed, if it did. */
  readonly forgetting: {
    readonly id: string;
    readonly problem: string | null;
  } | null;
  /** Each listed Machine's line, by id; one not followed yet is connecting. */
  readonly lines: Readonly<Record<string, Line>>;
  /** Each listed Machine's Speech to Text, by id, once it has said. */
  readonly speech: Readonly<Record<string, SpeechToTextState>>;
}

export const nobody: Known = {
  accountId: null,
  machines: null,
  savedRead: false,
  fetchedAt: null,
  problem: null,
  forgetting: null,
  lines: {},
  speech: {},
};

/** What another Actor may ask for, as the Messages it becomes. */
export type Request =
  | { readonly _tag: 'ReloadAsked' }
  | { readonly _tag: 'ForgetAsked'; readonly id: string }
  | { readonly _tag: 'ForgetDismissed' };

/** Between the app Layer and the Machines actor that publishes there. */
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
    /** The Machine's line now, then each change. */
    readonly line: (id: string) => Stream.Stream<Line>;
    /** The Machine's Speech to Text now, then each change; null until it says. */
    readonly speech: (id: string) => Stream.Stream<SpeechToTextState | null>;
    /** Waits until the Machine is in the signed-in Account's list. */
    readonly listed: (id: string) => Effect.Effect<void>;
    /** Where to dial the Machine, `wss://…/rpc`, and its Key, once it is listed at an `https://` address; waits until it is. */
    readonly reachable: (
      id: string,
    ) => Effect.Effect<{ readonly socket: string; readonly key: string }>;
    /** Asks Cloud Connect for the list again now. */
    readonly reload: Effect.Effect<void>;
    /** Forgets the Machine for good, and its records on this device. */
    readonly forget: (id: string) => Effect.Effect<void>;
    /** Done with a Forget that failed. */
    readonly keepForgetting: Effect.Effect<void>;
  }
>()('code/Machines') {}
