import {
  Context,
  Effect,
  Layer,
  Option,
  PubSub,
  Queue,
  Schema,
  Stream,
  SubscriptionRef,
} from 'effect';
import type { Replicas } from '@kestack/std-toolkit/replica';
import {
  HarnessAccountInfo,
  HarnessInfo,
  addressOf,
  type Machine as MachineSchema,
  ModelInfo,
  type SessionQuestions,
  SpeechToTextState,
} from '@kestack/connect/code';

/*
 * The Machines of the signed-in Account, for any Actor below the root
 * page, which Provides them. The Machines Actor of the Account signed in
 * publishes what it holds here, each Machine's line too, and each Machine
 * Actor its setup, its Unseen marks, its Agent Questions and its Replicas; each hears what
 * others ask, as the Web Platform's Account Switcher does with
 * `CurrentAccount`. A page is no Child of a Machine, so it reaches the
 * Machine's records through here: its Replicas, by its id.
 *
 * 1. Known     what is known of the Account's Machines now, and of each
 *              one's setup.
 * 2. Machines  the Capability: what is known, and asking for more; and
 *              the Link the Machines Actor and each Machine publish over.
 * 3. Prepared  the Machines of an Account not drawn yet tell the root
 *              page, which Provides it, they are ready to be drawn.
 */

type Machine = typeof MachineSchema.Type;

/**
 * The socket of a Machine at its public `https://` address, `wss://…/rpc`;
 * null for any other address, which is never dialled: the Machine Key
 * would cross in clear.
 */
export const socketUrl = (url: string | null) =>
  url?.startsWith('https://') === true
    ? `wss://${url.slice('https://'.length).replace(/\/+$/, '')}/rpc`
    : null;

/** A Machine's line, its socket, now. */
export type Line = 'connecting' | 'connected' | 'reconnecting';

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
 * A Machine's setup: its Harness Accounts as set, its Speech to Text, the
 * agents it runs, one per Harness Account, and the models each one that
 * runs takes; each null, or none, until it is known.
 */
export const SetupParts = Schema.Struct({
  accounts: Schema.NullOr(Schema.Array(HarnessAccountInfo)),
  speech: Schema.NullOr(SpeechToTextState),
  harnesses: Schema.NullOr(Schema.Array(HarnessInfo)),
  models: Schema.Array(ModelsRead),
});
export type SetupParts = typeof SetupParts.Type;

/** A Machine's setup as it is shared. */
export const Setup = Schema.Struct({
  ...SetupParts.fields,
  /** Whether what this device kept of it has been read, kept or not. */
  savedRead: Schema.Boolean,
  /** Why the Machine could not be asked, until it answers. */
  problem: Schema.NullOr(Schema.String),
});
export type Setup = typeof Setup.Type;

/** A change made to a Machine from Settings, which its setup shows at once. */
export const SetupChange = Schema.TaggedUnion({
  AccountSaved: { account: HarnessAccountInfo },
  AccountRemoved: { id: Schema.String },
});
export type SetupChange = typeof SetupChange.Type;

/** What another Actor asks of a Machine, or of every one, for null. */
export interface SetupRequest {
  readonly machineId: string | null;
  readonly ask: { readonly _tag: 'Asked' } | SetupChange;
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
  /**
   * Whether the Machines' Last Seen can be believed: Cloud Connect has
   * answered, or long enough passed without (`CHECK_FOR`). Until then a
   * Machine whose socket is on its way is only connecting, never down.
   */
  readonly checked: boolean;
  /** Why the last ask failed, until one does not. */
  readonly problem: string | null;
  /** The Machine being Forgotten, and why it failed, if it did. */
  readonly forgetting: {
    readonly id: string;
    readonly problem: string | null;
  } | null;
  /** Each listed Machine's line, by id; one not followed yet is connecting. */
  readonly lines: Readonly<Record<string, Line>>;
  /** Each listed Machine's setup, by id, while it lives. */
  readonly setups: Readonly<Record<string, Setup>>;
  /** Each listed Machine's Unseen marks (`Marks`), by id, once read, while it lives. */
  readonly seen: Readonly<Record<string, Readonly<Record<string, number>>>>;
  /** Each listed Machine's Agent Questions, by id, as it last said them, while it lives. */
  readonly questions: Readonly<Record<string, ReadonlyArray<SessionQuestions>>>;
}

export const nobody: Known = {
  accountId: null,
  machines: null,
  savedRead: false,
  fetchedAt: null,
  checked: false,
  problem: null,
  forgetting: null,
  lines: {},
  setups: {},
  seen: {},
  questions: {},
};

/** What another Actor may ask for, as the Messages it becomes. */
export type Request =
  | { readonly _tag: 'ReloadAsked' }
  | { readonly _tag: 'ForgetAsked'; readonly id: string }
  | { readonly _tag: 'ForgetDismissed' };

/** Between the root page and the Machines Actor and each Machine, which publish there. */
export class Link extends Context.Service<
  Link,
  {
    readonly known: SubscriptionRef.SubscriptionRef<Known>;
    /** What is asked of the Machines Actor. */
    readonly asked: Queue.Queue<Request>;
    /** What is asked of the Machines, each hearing its own. */
    readonly setupsAsked: PubSub.PubSub<SetupRequest>;
    /** Each running Machine's Replicas, by id: its sync Store's Instances. */
    readonly replicas: SubscriptionRef.SubscriptionRef<
      Readonly<Record<string, Replicas['Service']>>
    >;
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
    /** The Machine's setup now, then each change; null while it has none. */
    readonly setup: (id: string) => Stream.Stream<Setup | null>;
    /** Every Session's Agent Questions on the Machine now, then each change; none while it says none. */
    readonly questions: (
      id: string,
    ) => Stream.Stream<ReadonlyArray<SessionQuestions>>;
    /** Asks the Machine to be asked for its setup again. */
    readonly refresh: (id: string) => Effect.Effect<void>;
    /** Tells the Machine of a change made to it, for its setup to show at once and ask again. */
    readonly changed: (id: string, change: SetupChange) => Effect.Effect<void>;
    /** Waits until the Machine is in the signed-in Account's list. */
    readonly listed: (id: string) => Effect.Effect<void>;
    /** The Machine's Replicas, over its own sync Store; waits until the Machine runs here. */
    readonly replicas: (id: string) => Effect.Effect<Replicas['Service']>;
    /** Where to dial the Machine, `wss://…/rpc`, and its Key, once it is listed at an `https://` address; waits until it is. */
    readonly reachable: (
      id: string,
    ) => Effect.Effect<{ readonly socket: string; readonly key: string }>;
    /** Asks Cloud Connect for the list again now, and every Machine for its setup. */
    readonly reload: Effect.Effect<void>;
    /** Forgets the Machine for good, and its records on this device. */
    readonly forget: (id: string) => Effect.Effect<void>;
    /** Done with a Forget that failed. */
    readonly keepForgetting: Effect.Effect<void>;
  }
>()('code/Machines') {}

const none: ReadonlyArray<SessionQuestions> = [];

/** The Machines, as the Machines Actor and each Machine publish them. */
export const machinesLayer: Layer.Layer<Machines | Link> = Layer.effectContext(
  Effect.gen(function* () {
    const known = yield* SubscriptionRef.make<Known>(nobody);
    const asked = yield* Queue.unbounded<Request>();
    const setupsAsked = yield* PubSub.unbounded<SetupRequest>();
    const replicas = yield* SubscriptionRef.make<
      Readonly<Record<string, Replicas['Service']>>
    >({});
    const ask = (request: Request) =>
      Effect.asVoid(Queue.offer(asked, request));
    const askSetups = (request: SetupRequest) =>
      Effect.asVoid(PubSub.publish(setupsAsked, request));
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
    const setup = (id: string) =>
      state.pipe(
        Stream.map(({ setups }) => setups[id] ?? null),
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
    return Context.make(Link, { known, asked, setupsAsked, replicas }).pipe(
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
        setup,
        questions: (id) =>
          state.pipe(
            Stream.map(({ questions }) => questions[id] ?? none),
            Stream.changes,
          ),
        refresh: (id) => askSetups({ machineId: id, ask: { _tag: 'Asked' } }),
        changed: (id, change) => askSetups({ machineId: id, ask: change }),
        listed: (id) => Effect.asVoid(first(id, () => true)),
        replicas: (id) =>
          SubscriptionRef.changes(replicas).pipe(
            Stream.map((running) => running[id]),
            Stream.filter((each) => each !== undefined),
            Stream.runHead,
            Effect.flatMap(
              Option.match({
                onNone: () => Effect.never,
                onSome: Effect.succeed,
              }),
            ),
          ),
        reachable: (id) =>
          first(id, ({ status, key }) => {
            const socket = socketUrl(addressOf(status));
            return socket === null ? null : { socket, key };
          }),
        reload: Effect.andThen(
          ask({ _tag: 'ReloadAsked' }),
          askSetups({ machineId: null, ask: { _tag: 'Asked' } }),
        ),
        forget: (id) => ask({ _tag: 'ForgetAsked', id }),
        keepForgetting: ask({ _tag: 'ForgetDismissed' }),
      }),
    );
  }),
);

/*
 * 3. Prepared: what the Machines of an Account not drawn yet tell the root
 * page: they are ready to be drawn, the list this device kept for the
 * Account read, kept or not, so the app is drawn for it in one step rather
 * than from nothing.
 */
export class Prepared extends Context.Service<
  Prepared,
  {
    /** The Machines of `accountId` have read their kept list. */
    readonly ready: (accountId: string) => Effect.Effect<void>;
  }
>()('code/MachinesPrepared') {}
