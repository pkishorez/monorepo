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
  ModelInfo,
  type SessionQuestions,
  SpeechToTextState,
} from '@kestack/connect/code';
import {
  addressOf,
  type Connection as ConnectionSchema,
} from '@kestack/connect/cloud';

/*
 * The Connections of the signed-in Account, for any Actor below the root
 * page, which Provides them. The Connections Actor of the Account signed in
 * publishes what it holds here, each Connection's link too, and each Connection
 * Actor its setup, its Unseen marks, its Agent Questions, how they are
 * being answered here, and its Replicas; each hears what
 * others ask, as the Web Platform's Account Switcher does with
 * `CurrentAccount`. A page is no Child of a Connection, so it reaches the
 * Connection's records through here: its Replicas, by its id.
 *
 * 1. Known     what is known of the Account's Connections now, and of each
 *              one's setup.
 * 2. Connections  the Capability: what is known, and asking for more; and
 *              the ConnectionsChannel the Connections Actor and each Connection publish over.
 * 3. Prepared  the Connections of an Account not drawn yet tell the root
 *              page, which Provides it, they are ready to be drawn.
 */

type Connection = typeof ConnectionSchema.Type;

/**
 * Where the sockets to a Connection at its public `https://` address go,
 * `wss://…`, before the path of the Plugin dialled (`reach/`); null for
 * any other address, which is never dialled: the Connection Key would
 * cross in clear.
 */
export const tunnelOf = (url: string | null) =>
  url?.startsWith('https://') === true
    ? `wss://${url.slice('https://'.length).replace(/\/+$/, '')}`
    : null;

/** A Connection's link, its socket, now. */
export type Link = 'linking' | 'linked' | 'relinking';

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
 * A Connection's setup: its Harness Accounts as set, its Speech to Text, the
 * agents it runs, one per Harness Account, and the models each one that
 * runs takes; each null, or none, until it is known.
 */
export const SetupParts = Schema.Struct({
  accounts: Schema.NullOr(Schema.Array(HarnessAccountInfo.schema)),
  speech: Schema.NullOr(SpeechToTextState.schema),
  harnesses: Schema.NullOr(Schema.Array(HarnessInfo.schema)),
  models: Schema.Array(ModelsRead),
});
export type SetupParts = typeof SetupParts.Type;

/** A Connection's setup as it is shared. */
export const Setup = Schema.Struct({
  ...SetupParts.fields,
  /** Whether what this device kept of it has been read, kept or not. */
  savedRead: Schema.Boolean,
  /** Why the Connection could not be asked, until it answers. */
  problem: Schema.NullOr(Schema.String),
});
export type Setup = typeof Setup.Type;

/** A change made to a Connection from Settings, which its setup shows at once. */
export const SetupChange = Schema.TaggedUnion({
  AccountSaved: { account: HarnessAccountInfo.schema },
  AccountRemoved: { id: Schema.String },
});
export type SetupChange = typeof SetupChange.Type;

/** What another Actor asks of a Connection, or of every one, for null. */
export interface SetupRequest {
  readonly connectionId: string | null;
  readonly ask: { readonly _tag: 'Asked' } | SetupChange;
}

/** One Item of an Agent Question, as it is being answered here. */
export const ItemDraft = Schema.Struct({
  chosen: Schema.Array(Schema.String),
  typed: Schema.String,
  /** The typed answer is chosen. */
  other: Schema.Boolean,
});
export type ItemDraft = typeof ItemDraft.Type;

/** Every Item's answer so far, by Item id. */
export const Drafts = Schema.Record(Schema.String, ItemDraft);
export type Drafts = typeof Drafts.Type;

/**
 * How a Session's Agent Questions are being answered here, each by its
 * id: kept by their Connection while each is asked, in memory only, since an
 * answer may be a secret (`records/questions/answering.ts`).
 */
export const Answering = Schema.Struct({
  /** Each question's answer so far. */
  drafts: Schema.Record(Schema.String, Drafts),
  /** The questions minimised. */
  minimised: Schema.Array(Schema.String),
  /** The questions sent with an Item unanswered, whose Items left are marked. */
  tried: Schema.Array(Schema.String),
  /** The questions answered here, not shown while their Connection still lists them. */
  sent: Schema.Array(Schema.String),
});
export type Answering = typeof Answering.Type;

/** What is known of the Account's Connections now. */
export interface Known {
  /** Whose Connections; null while nobody is signed in. */
  readonly accountId: string | null;
  /** The list, saved or fetched; null before either. */
  readonly connections: ReadonlyArray<Connection> | null;
  /** Whether the list kept on this device has been read, kept or not. */
  readonly savedRead: boolean;
  /** When Cloud Connect last answered, epoch ms; null before it has. */
  readonly fetchedAt: number | null;
  /**
   * Whether the Connections' Last Seen can be believed: Cloud Connect has
   * answered, or long enough passed without (`CHECK_FOR`). Until then a
   * Connection whose socket is on its way is only linking, never down.
   */
  readonly checked: boolean;
  /** Why the last ask failed, until one does not. */
  readonly problem: string | null;
  /** The Connection being Forgotten, and why it failed, if it did. */
  readonly forgetting: {
    readonly id: string;
    readonly problem: string | null;
  } | null;
  /** Each listed Connection's link, by id; one not followed yet is linking. */
  readonly links: Readonly<Record<string, Link>>;
  /** Each listed Connection's setup, by id, while it lives. */
  readonly setups: Readonly<Record<string, Setup>>;
  /** Each listed Connection's Unseen marks (`Marks`), by id, once read, while it lives. */
  readonly seen: Readonly<Record<string, Readonly<Record<string, number>>>>;
  /** Each listed Connection's Agent Questions, by id, as it last said them, while it lives. */
  readonly questions: Readonly<Record<string, ReadonlyArray<SessionQuestions>>>;
  /**
   * How each listed Connection's Agent Questions are being answered here, by
   * its id, then by Session id, while each is asked.
   */
  readonly answering: Readonly<
    Record<string, Readonly<Record<string, Answering>>>
  >;
}

export const nobody: Known = {
  accountId: null,
  connections: null,
  savedRead: false,
  fetchedAt: null,
  checked: false,
  problem: null,
  forgetting: null,
  links: {},
  setups: {},
  seen: {},
  questions: {},
  answering: {},
};

/** What another Actor may ask for, as the Messages it becomes. */
export type Request =
  | { readonly _tag: 'ReloadAsked' }
  | { readonly _tag: 'ForgetAsked'; readonly id: string }
  | { readonly _tag: 'ForgetDismissed' };

/** How a Session's Agent Questions are being answered, for its Connection to keep. */
export interface AnsweringKept {
  readonly connectionId: string;
  readonly sessionId: string;
  readonly answering: Answering;
}

/** Between the root page and the Connections Actor and each Connection, which publish there. */
export class ConnectionsChannel extends Context.Service<
  ConnectionsChannel,
  {
    readonly known: SubscriptionRef.SubscriptionRef<Known>;
    /** What is asked of the Connections Actor. */
    readonly asked: Queue.Queue<Request>;
    /** What is asked of the Connections, each hearing its own. */
    readonly setupsAsked: PubSub.PubSub<SetupRequest>;
    /** How Agent Questions are being answered, each Connection keeping its own. */
    readonly answeringKept: PubSub.PubSub<AnsweringKept>;
    /** Each running Connection's Replicas, by id: its sync Store's Instances. */
    readonly replicas: SubscriptionRef.SubscriptionRef<
      Readonly<Record<string, Replicas['Service']>>
    >;
  }
>()('code/ConnectionsChannel') {}

/** The signed-in Account's Connections: what is known, and asking for more. */
export class Connections extends Context.Service<
  Connections,
  {
    /** What is known now, then each change. */
    readonly state: Stream.Stream<Known>;
    readonly current: Effect.Effect<Known>;
    /** The id of the Account whose Connections are known; waits until one is. */
    readonly account: Effect.Effect<string>;
    /** The Connection as listed now, then each change; null while it is not. */
    readonly connection: (id: string) => Stream.Stream<Connection | null>;
    /** The Connection's link now, then each change. */
    readonly link: (id: string) => Stream.Stream<Link>;
    /** The Connection's setup now, then each change; null while it has none. */
    readonly setup: (id: string) => Stream.Stream<Setup | null>;
    /** Every Session's Agent Questions on the Connection now, then each change; none while it says none. */
    readonly questions: (
      id: string,
    ) => Stream.Stream<ReadonlyArray<SessionQuestions>>;
    /**
     * How the Session's Agent Questions are being answered here, as its
     * Connection keeps them while each is asked; null when nothing is kept.
     */
    readonly answering: (
      id: string,
      sessionId: string,
    ) => Effect.Effect<Answering | null>;
    /** Gives the Connection how the Session's Agent Questions are being answered, to keep. */
    readonly keepAnswering: (
      id: string,
      sessionId: string,
      answering: Answering,
    ) => Effect.Effect<void>;
    /** Asks the Connection to be asked for its setup again. */
    readonly refresh: (id: string) => Effect.Effect<void>;
    /** Tells the Connection of a change made to it, for its setup to show at once and ask again. */
    readonly changed: (id: string, change: SetupChange) => Effect.Effect<void>;
    /** Waits until the Connection is in the signed-in Account's list. */
    readonly listed: (id: string) => Effect.Effect<void>;
    /** The Connection's Replicas, over its own sync Store; waits until the Connection runs here. */
    readonly replicas: (id: string) => Effect.Effect<Replicas['Service']>;
    /** Where the Connection's sockets go, `wss://…` (`tunnelOf`), and its Key, once it is listed at an `https://` address; waits until it is. */
    readonly reachable: (
      id: string,
    ) => Effect.Effect<{ readonly tunnel: string; readonly key: string }>;
    /** Asks Cloud Connect for the list again now, and every Connection for its setup. */
    readonly reload: Effect.Effect<void>;
    /** Forgets the Connection for good, and its records on this device. */
    readonly forget: (id: string) => Effect.Effect<void>;
    /** Done with a Forget that failed. */
    readonly keepForgetting: Effect.Effect<void>;
  }
>()('code/Connections') {}

const none: ReadonlyArray<SessionQuestions> = [];

/** The Connections, as the Connections Actor and each Connection publish them. */
export const connectionsLayer: Layer.Layer<Connections | ConnectionsChannel> =
  Layer.effectContext(
    Effect.gen(function* () {
      const known = yield* SubscriptionRef.make<Known>(nobody);
      const asked = yield* Queue.unbounded<Request>();
      const setupsAsked = yield* PubSub.unbounded<SetupRequest>();
      const answeringKept = yield* PubSub.unbounded<AnsweringKept>();
      const replicas = yield* SubscriptionRef.make<
        Readonly<Record<string, Replicas['Service']>>
      >({});
      const ask = (request: Request) =>
        Effect.asVoid(Queue.offer(asked, request));
      const askSetups = (request: SetupRequest) =>
        Effect.asVoid(PubSub.publish(setupsAsked, request));
      const state = SubscriptionRef.changes(known);
      const connection = (id: string) =>
        state.pipe(
          Stream.map(
            ({ connections }) =>
              connections?.find((each) => each.id === id) ?? null,
          ),
          Stream.changes,
        );
      const link = (id: string) =>
        state.pipe(
          Stream.map(({ links }) => links[id] ?? 'linking'),
          Stream.changes,
        );
      const setup = (id: string) =>
        state.pipe(
          Stream.map(({ setups }) => setups[id] ?? null),
          Stream.changes,
        );
      /** The first `found` of the Connection as listed; waits for one, for ever if need be. */
      const first = <A>(
        id: string,
        found: (connection: Connection) => A | null,
      ) =>
        connection(id).pipe(
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
      return Context.make(ConnectionsChannel, {
        known,
        asked,
        setupsAsked,
        answeringKept,
        replicas,
      }).pipe(
        Context.add(Connections, {
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
          connection,
          link,
          setup,
          questions: (id) =>
            state.pipe(
              Stream.map(({ questions }) => questions[id] ?? none),
              Stream.changes,
            ),
          answering: (id, sessionId) =>
            Effect.map(
              SubscriptionRef.get(known),
              ({ answering }) => answering[id]?.[sessionId] ?? null,
            ),
          keepAnswering: (id, sessionId, answering) =>
            Effect.asVoid(
              PubSub.publish(answeringKept, {
                connectionId: id,
                sessionId,
                answering,
              }),
            ),
          refresh: (id) =>
            askSetups({ connectionId: id, ask: { _tag: 'Asked' } }),
          changed: (id, change) => askSetups({ connectionId: id, ask: change }),
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
              const tunnel = tunnelOf(addressOf(status));
              return tunnel === null ? null : { tunnel, key };
            }),
          reload: Effect.andThen(
            ask({ _tag: 'ReloadAsked' }),
            askSetups({ connectionId: null, ask: { _tag: 'Asked' } }),
          ),
          forget: (id) => ask({ _tag: 'ForgetAsked', id }),
          keepForgetting: ask({ _tag: 'ForgetDismissed' }),
        }),
      );
    }),
  );

/*
 * 3. Prepared: what the Connections of an Account not drawn yet tell the root
 * page: they are ready to be drawn, the list this device kept for the
 * Account read, kept or not, so the app is drawn for it in one step rather
 * than from nothing.
 */
export class Prepared extends Context.Service<
  Prepared,
  {
    /** The Connections of `accountId` have read their kept list. */
    readonly ready: (accountId: string) => Effect.Effect<void>;
  }
>()('code/ConnectionsPrepared') {}
