import {
  Context,
  Effect,
  Layer,
  Option,
  PubSub,
  Schema,
  type Scope,
  Stream,
  SubscriptionRef,
} from 'effect';
import type { Replicas } from '@kestack/std-toolkit/replica';
import type { CodeClients } from '@kestack/connect/code';
import {
  HarnessAccountInfo,
  HarnessInfo,
  ModelInfo,
  SessionJobs,
  SessionQuestions,
  SpeechToTextState,
} from '@kestack/connect/code';
import {
  addressOf,
  type Connection as ConnectionSchema,
  PluginMismatch,
} from '@kestack/connect/cloud';

/*
 * What an Account's page gives every Actor under it, its pages too: the
 * Account's Connections. The page holds the Connection List, each
 * Connection's link, and what each Connection, its Child, says of itself:
 * its setup, its Unseen marks, its Agent Questions and how they are being
 * answered here, and its Background Jobs; and each Connection hears here
 * what others ask of it. A page is no Child of a Connection, so it reaches
 * the Connection's records and socket through here: its Replicas and its
 * socket, by its id, each only while the Connection runs. Until
 * the Account is the one active, nobody's Connections are known, and what
 * asks of them waits.
 *
 * 1. Known        what is known of the Account's Connections now, and of
 *                 each one's setup.
 * 2. Connections  the Capability: what is known, and asking for more; and
 *                 for each Connection, what it says, what it is asked, and
 *                 its Replicas while it runs. What is said and asked of the
 *                 list is a Request to the page (`Request`).
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

/**
 * What a Connection holds while it runs, for the pages to borrow: its
 * Replicas, and its sockets, the one to it open while it runs.
 */
export interface Running {
  readonly replicas: Replicas['Service'];
  readonly clients: CodeClients['Service'];
}

/** What is known of the Account's Connections now. */
export interface Known {
  /** Whose Connections; null while nobody is signed in. */
  readonly accountId: string | null;
  /** The list, saved or fetched; null before either. */
  readonly connections: ReadonlyArray<Connection> | null;
  /** Whether the list kept on this device has been read, kept or not. */
  readonly savedRead: boolean;
  /** When Connect Cloud last answered, epoch ms; null before it has. */
  readonly fetchedAt: number | null;
  /**
   * Whether the Connections' Last Seen can be believed: Connect Cloud has
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
  /** Each listed Connection's Background Jobs, by id, as it last said them, while it lives. */
  readonly jobs: Readonly<Record<string, ReadonlyArray<SessionJobs>>>;
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
  jobs: {},
};

/** What a Connection says of itself, for the Account's page to share. */
export const Said = Schema.Struct({
  link: Schema.Literals(['linking', 'linked', 'relinking']),
  /** The Release it said it runs as it closed a socket, until one is answered. */
  mismatch: Schema.NullOr(PluginMismatch.schema),
  /** Whether it closed a socket for offering a key it no longer holds, until one is answered. */
  expired: Schema.Boolean,
  setup: Setup,
  /** Its Unseen marks; null until read. */
  seen: Schema.NullOr(Schema.Record(Schema.String, Schema.Finite)),
  questions: Schema.Array(SessionQuestions.schema),
  /** How each Session's questions are being answered here, by Session id. */
  answering: Schema.Record(Schema.String, Answering),
  jobs: Schema.Array(SessionJobs.schema),
});
export type Said = typeof Said.Type;

/** What is known of the Account's Connections from what each one said, by id, of those running. */
export const saidOf = (
  said: Readonly<Record<string, Said>>,
  running: ReadonlyArray<string>,
): Pick<Known, 'setups' | 'seen' | 'questions' | 'answering' | 'jobs'> => {
  const each = running.flatMap((id) => {
    const one = said[id];
    return one === undefined ? [] : [[id, one] as const];
  });
  const by = <A>(part: (one: Said) => A | null) =>
    Object.fromEntries(
      each.flatMap(([id, one]) => {
        const value = part(one);
        return value === null ? [] : [[id, value]];
      }),
    ) as Record<string, A>;
  return {
    setups: by(({ setup }) => setup),
    seen: by(({ seen }) => seen),
    questions: by(({ questions }) => questions),
    answering: by(({ answering }) => answering),
    jobs: by(({ jobs }) => jobs),
  };
};

/** What another Actor may ask of the list, and what a Connection says, as the Messages they become. */
export type Request =
  | { readonly _tag: 'ReloadAsked' }
  | { readonly _tag: 'ForgetAsked'; readonly id: string }
  | { readonly _tag: 'ForgetDismissed' }
  | {
      readonly _tag: 'Renamed';
      readonly id: string;
      readonly displayName: string | null;
    }
  | {
      readonly _tag: 'Said';
      readonly connectionId: string;
      readonly said: Said;
    };

/** What one Connection is asked: its setup again, a change Settings made, or how a Session's questions are being answered. */
export type Ask =
  | SetupRequest['ask']
  | {
      readonly _tag: 'AnsweringKept';
      readonly sessionId: string;
      readonly answering: Answering;
    };

/** The Account's Connections: what is known, and asking for more. */
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
    /** Every Session's Background Jobs on the Connection now, then each change; none while it says none. */
    readonly jobs: (id: string) => Stream.Stream<ReadonlyArray<SessionJobs>>;
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
    /** Waits until the Connection is in the Account's list. */
    readonly listed: (id: string) => Effect.Effect<void>;
    /** The Connection's Replicas, over its own sync Store; waits until the Connection runs here. */
    readonly replicas: (id: string) => Effect.Effect<Replicas['Service']>;
    /** The Connection's sockets while it runs here, then each change; null while it does not. */
    readonly clients: (
      id: string,
    ) => Stream.Stream<CodeClients['Service'] | null>;
    /** Where the Connection's sockets go, `wss://…` (`tunnelOf`), and its Key, once it is listed at an `https://` address; waits until it is. */
    readonly reachable: (
      id: string,
    ) => Effect.Effect<{ readonly tunnel: string; readonly key: string }>;
    /** Asks Connect Cloud for the list again now, and every Connection for its setup. */
    readonly reload: Effect.Effect<void>;
    /** Forgets the Connection for good, and its records on this device. */
    readonly forget: (id: string) => Effect.Effect<void>;
    /** Done with a Forget that failed. */
    readonly keepForgetting: Effect.Effect<void>;
    /** Tells the list Connect Cloud renamed the Connection, for every name of it to show at once. */
    readonly renamed: (
      id: string,
      displayName: string | null,
    ) => Effect.Effect<void>;
    /** A Connection says what it holds, for the page to share. */
    readonly say: (id: string, said: Said) => Effect.Effect<void>;
    /** What the Connection is asked, as it is asked. */
    readonly asked: (id: string) => Stream.Stream<Ask>;
    /** What the Connection holds while it runs, said while the Scope lasts. */
    readonly serve: (
      id: string,
      running: Running,
    ) => Effect.Effect<void, never, Scope.Scope>;
  }
>()('code/Connections') {}

const none: ReadonlyArray<SessionQuestions> = [];
const noJobs: ReadonlyArray<SessionJobs> = [];

/** Where what is known comes from, and where a Request goes: the Account's page. */
export interface Source {
  /** What is known now, then each change. */
  readonly known: Stream.Stream<Known>;
  readonly current: Effect.Effect<Known>;
  readonly send: (request: Request) => Effect.Effect<void>;
}

/** The first of `stream` that is not null; waits for one, for ever if need be. */
const firstOf = <A>(stream: Stream.Stream<A | null>): Effect.Effect<A> =>
  stream.pipe(
    Stream.filter((each): each is A => each !== null),
    Stream.runHead,
    Effect.flatMap(
      Option.match({ onNone: () => Effect.never, onSome: Effect.succeed }),
    ),
  );

/** The Connections, from what the Account's page holds and to the Requests it hears. */
export const connectionsOf = ({ known, current, send }: Source) =>
  Effect.gen(function* () {
    const asks = yield* PubSub.unbounded<{
      readonly connectionId: string | null;
      readonly ask: Ask;
    }>();
    const running = yield* SubscriptionRef.make<
      Readonly<Record<string, Running>>
    >({});
    const runningOf = (id: string) =>
      SubscriptionRef.changes(running).pipe(
        Stream.map((now) => now[id] ?? null),
        Stream.changes,
      );
    const ask = (connectionId: string | null, each: Ask) =>
      Effect.asVoid(PubSub.publish(asks, { connectionId, ask: each }));
    const connection = (id: string) =>
      known.pipe(
        Stream.map(
          ({ connections }) =>
            connections?.find((each) => each.id === id) ?? null,
        ),
        Stream.changes,
      );
    const first = <A>(
      id: string,
      found: (connection: Connection) => A | null,
    ) =>
      firstOf(
        Stream.map(connection(id), (each) =>
          each === null ? null : found(each),
        ),
      );
    return Connections.of({
      state: known,
      current,
      account: firstOf(Stream.map(known, ({ accountId }) => accountId)),
      connection,
      link: (id) =>
        known.pipe(
          Stream.map(({ links }) => links[id] ?? 'linking'),
          Stream.changes,
        ),
      setup: (id) =>
        known.pipe(
          Stream.map(({ setups }) => setups[id] ?? null),
          Stream.changes,
        ),
      questions: (id) =>
        known.pipe(
          Stream.map(({ questions }) => questions[id] ?? none),
          Stream.changes,
        ),
      jobs: (id) =>
        known.pipe(
          Stream.map(({ jobs }) => jobs[id] ?? noJobs),
          Stream.changes,
        ),
      answering: (id, sessionId) =>
        Effect.map(
          current,
          ({ answering }) => answering[id]?.[sessionId] ?? null,
        ),
      keepAnswering: (id, sessionId, answering) =>
        ask(id, { _tag: 'AnsweringKept', sessionId, answering }),
      refresh: (id) => ask(id, { _tag: 'Asked' }),
      changed: (id, change) => ask(id, change),
      listed: (id) => Effect.asVoid(first(id, () => true)),
      replicas: (id) =>
        firstOf(Stream.map(runningOf(id), (now) => now?.replicas ?? null)),
      clients: (id) =>
        Stream.map(runningOf(id), (now) => now?.clients ?? null).pipe(
          Stream.changes,
        ),
      reachable: (id) =>
        first(id, ({ status, key }) => {
          const tunnel = tunnelOf(addressOf(status));
          return tunnel === null ? null : { tunnel, key };
        }),
      reload: Effect.andThen(
        send({ _tag: 'ReloadAsked' }),
        ask(null, { _tag: 'Asked' }),
      ),
      forget: (id) => send({ _tag: 'ForgetAsked', id }),
      keepForgetting: send({ _tag: 'ForgetDismissed' }),
      renamed: (id, displayName) => send({ _tag: 'Renamed', id, displayName }),
      say: (connectionId, said) => send({ _tag: 'Said', connectionId, said }),
      asked: (id) =>
        Stream.fromPubSub(asks).pipe(
          Stream.filter(
            ({ connectionId }) => connectionId === null || connectionId === id,
          ),
          Stream.map(({ ask }) => ask),
        ),
      serve: (id, served) =>
        Effect.asVoid(
          Effect.acquireRelease(
            SubscriptionRef.update(running, (now) => ({
              ...now,
              [id]: served,
            })),
            () =>
              SubscriptionRef.update(running, (now) => {
                const { [id]: _gone, ...rest } = now;
                return rest;
              }),
          ),
        ),
    });
  });

/**
 * The Connections in memory, for a test: what is known is `known`, with
 * what each Connection says over it; a Request of the list is dropped.
 */
export const connectionsMemory = (
  known: SubscriptionRef.SubscriptionRef<Known>,
): Layer.Layer<Connections> =>
  Layer.effect(
    Connections,
    Effect.gen(function* () {
      const said = yield* SubscriptionRef.make<Readonly<Record<string, Said>>>(
        {},
      );
      const over = (now: Known, by: Readonly<Record<string, Said>>): Known => ({
        ...now,
        ...saidOf(by, Object.keys(by)),
      });
      return yield* connectionsOf({
        known: Stream.zipLatestWith(
          SubscriptionRef.changes(known),
          SubscriptionRef.changes(said),
          over,
        ),
        current: Effect.zipWith(
          SubscriptionRef.get(known),
          SubscriptionRef.get(said),
          over,
        ),
        send: (request) =>
          request._tag === 'Said'
            ? SubscriptionRef.update(said, (now) => ({
                ...now,
                [request.connectionId]: request.said,
              }))
            : Effect.void,
      });
    }),
  );
