import { Context, Schema } from 'effect';
import type { Effect, PubSub, Queue, Stream, SubscriptionRef } from 'effect';
import {
  HarnessAccountInfo,
  HarnessInfo,
  type Machine as MachineSchema,
  ModelInfo,
  SpeechToTextState,
} from '@kestack/connect/code';

type Machine = typeof MachineSchema.Type;

/** A Machine's line, its socket, now. */
export type Line = 'connecting' | 'connected' | 'reconnecting';

/*
 * The Machines of the signed-in Account, for any Actor: the app Layer
 * gives it (`services/machines.ts`), and the Machine List of the Account
 * signed in publishes what it holds there, each Machine's line too, and
 * each Machine's Kit what it keeps of its Machine; each hears what others
 * ask, as the Web Platform's Account Switcher does with `CurrentAccount`.
 */

/** What was read for one Harness Account: its list, or why it could not be. */
export const Read = <S extends Schema.Top>(item: S) =>
  Schema.Struct({
    account: Schema.String,
    list: Schema.Array(item),
    /** Why it could not be read; null when it was. */
    problem: Schema.NullOr(Schema.String),
  });

/** An answer's reads over what showed: one refused keeps what showed for its account. */
export const readOver = <A extends { readonly problem: string | null }>(
  before: ReadonlyArray<A & { readonly account: string }>,
  after: ReadonlyArray<A & { readonly account: string }>,
) =>
  after.map(
    (read) =>
      (read.problem === null
        ? undefined
        : before.find(
            (each) => each.account === read.account && each.problem === null,
          )) ?? read,
  );

/** The models read for one Harness Account. */
export const ModelsRead = Read(ModelInfo);

/**
 * What a Machine Kit holds of its Machine: its Harness Accounts as set,
 * its Speech to Text, the agents it runs, one per Harness Account, and the
 * models each one that runs takes; each null, or none, until it is known.
 */
export const KitParts = Schema.Struct({
  accounts: Schema.NullOr(Schema.Array(HarnessAccountInfo)),
  speech: Schema.NullOr(SpeechToTextState),
  harnesses: Schema.NullOr(Schema.Array(HarnessInfo)),
  models: Schema.Array(ModelsRead),
});
export type KitParts = typeof KitParts.Type;

/** A Machine Kit as it is shared. */
export const Kit = Schema.Struct({
  ...KitParts.fields,
  /** Whether what this device kept of it has been read, kept or not. */
  savedRead: Schema.Boolean,
  /** Why the Machine could not be asked, until it answers. */
  problem: Schema.NullOr(Schema.String),
});
export type Kit = typeof Kit.Type;

/** A change made to a Machine from Settings, which its Kit shows at once. */
export const KitChange = Schema.TaggedUnion({
  AccountSaved: { account: HarnessAccountInfo },
  AccountRemoved: { id: Schema.String },
});
export type KitChange = typeof KitChange.Type;

/** What another Actor asks of a Machine Kit, or of every one, for null. */
export interface KitRequest {
  readonly machineId: string | null;
  readonly ask: { readonly _tag: 'Asked' } | KitChange;
}

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
  /** Each listed Machine's Kit, by id, while it lives. */
  readonly kits: Readonly<Record<string, Kit>>;
}

export const nobody: Known = {
  accountId: null,
  machines: null,
  savedRead: false,
  fetchedAt: null,
  problem: null,
  forgetting: null,
  lines: {},
  kits: {},
};

/** What another Actor may ask for, as the Messages it becomes. */
export type Request =
  | { readonly _tag: 'ReloadAsked' }
  | { readonly _tag: 'ForgetAsked'; readonly id: string }
  | { readonly _tag: 'ForgetDismissed' };

/** Between the app Layer and the Machine List and its Kits, which publish there. */
export class Link extends Context.Service<
  Link,
  {
    readonly known: SubscriptionRef.SubscriptionRef<Known>;
    /** What is asked of the Machine List. */
    readonly asked: Queue.Queue<Request>;
    /** What is asked of the Kits, each hearing its own. */
    readonly kitsAsked: PubSub.PubSub<KitRequest>;
  }
>()('code/MachinesLink') {}

/** The signed-in Account's Machines: what is known, and asking for more. */
export class Machines extends Context.Service<
  Machines,
  {
    /** What is known now, then each change. */
    readonly state: Stream.Stream<Known>;
    readonly current: Effect.Effect<Known>;
    /** The id of the Account whose Machines are known; waits until one is. */
    readonly account: Effect.Effect<string>;
    /** The Machine as listed now, then each change; null while it is not. */
    readonly machine: (id: string) => Stream.Stream<Machine | null>;
    /** The Machine's line now, then each change. */
    readonly line: (id: string) => Stream.Stream<Line>;
    /** The Machine's Kit now, then each change; null while it has none. */
    readonly kit: (id: string) => Stream.Stream<Kit | null>;
    /** Asks the Machine's Kit to ask its Machine again. */
    readonly refresh: (id: string) => Effect.Effect<void>;
    /** Tells the Machine's Kit of a change made to the Machine, to show at once and ask again. */
    readonly changed: (id: string, change: KitChange) => Effect.Effect<void>;
    /** Waits until the Machine is in the signed-in Account's list. */
    readonly listed: (id: string) => Effect.Effect<void>;
    /** Where to dial the Machine, `wss://…/rpc`, and its Key, once it is listed at an `https://` address; waits until it is. */
    readonly reachable: (
      id: string,
    ) => Effect.Effect<{ readonly socket: string; readonly key: string }>;
    /** Asks Cloud Connect for the list again now, and every Kit its Machine. */
    readonly reload: Effect.Effect<void>;
    /** Forgets the Machine for good, and its records on this device. */
    readonly forget: (id: string) => Effect.Effect<void>;
    /** Done with a Forget that failed. */
    readonly keepForgetting: Effect.Effect<void>;
  }
>()('code/Machines') {}
