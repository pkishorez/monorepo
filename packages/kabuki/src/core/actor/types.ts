import type { Context, Effect, Layer, Scope, Stream } from 'effect';

export type Tagged = { readonly _tag: string };

/** The one State of an Actor declared without States. */
export type Single = { readonly _tag: 'Single' };

type AnyKey = Context.Key<any, any>;
/** The Capabilities an Actor's own code may use. */
export type Requires = ReadonlyArray<AnyKey>;

type IdsOf<R extends Requires> = R[number] extends infer K
  ? K extends Context.Key<infer I, any>
    ? I
    : never
  : never;

export type Only<U, T> = Extract<U, { readonly _tag: T }>;

/** An Instance's data at one moment: its own Model and State, and the Props its parent hands it. */
export type Data<Model, State, Props = void> = {
  readonly model: Model;
  readonly state: State;
  /** What the parent hands it now. Read only: a change runs none of its rules. */
  readonly props: Props;
};

/**
 * What an Instance's own work holds of it: Workers and Provides. Sends go
 * only to this Instance; `get` and `changes` are always current.
 */
export interface Self<Model, State, Msg, Props = void> {
  readonly id: string;
  readonly send: (message: Msg) => Effect.Effect<void>;
  readonly get: Effect.Effect<Data<Model, State, Props>>;
  /** The current data, then each new value after a Message or the parent changes it. */
  readonly changes: Stream.Stream<Data<Model, State, Props>>;
  /**
   * The app's Time now, in milliseconds since the Runtime started: the clock
   * Messages are stamped with, which stands still while stopped. A Worker
   * that waits until a Time in the Model sleeps for `that - now`, so it waits
   * only what is left when it starts again on a resume or a fork.
   */
  readonly now: Effect.Effect<number>;
}

/** Where a Command keeps the Effect it runs, out of sight of a comparison. */
export const RUN: unique symbol = Symbol.for('@kestack/kabuki/Command/run');

/**
 * An errand an Update asks for, as `Command.make` makes it: its name and
 * args, and the Effect that ends with at most one Message, Sent to its
 * Instance. Nothing stops it but its Instance stopping; work that must be
 * stopped, show progress or survive a stop is a Worker.
 */
export interface Command<Out, Ids = never> {
  readonly name: string;
  readonly args: unknown;
  readonly [RUN]: Effect.Effect<Out, never, Ids>;
}

/** The Updates of one level, by Message tag. */
type Rules<
  Model,
  State,
  Props,
  Msg extends Tagged,
  R extends Requires,
  Next,
> = {
  readonly [K in Msg['_tag']]?: (
    message: Only<Msg, K>,
    scope: Data<Model, State, Props> & {
      /** The Message's Time, in milliseconds since the Runtime started. */
      readonly at: number;
    },
  ) => {
    readonly model?: Model;
    readonly state?: Next;
    /** The Commands to run, concurrently. */
    readonly command?:
      | Command<Msg | void, IdsOf<R>>
      | ReadonlyArray<Command<Msg | void, IdsOf<R>>>;
  };
};

/** A Worker's Effect: scoped, Sending its Instance, given the key it runs for. */
type Run<Model, State, Props, Msg, R extends Requires> = (
  self: Self<Model, State, Msg, Props>,
  key: string,
) => Effect.Effect<unknown, never, IdsOf<R> | Scope.Scope>;

/**
 * Work that runs for exactly as long as its Condition holds, read from the
 * Instance's own data, Props included, whenever it changes. Where it is
 * written is part of the Condition: at the top it is owned by the Instance,
 * in a State's block by that State. Inside that, it runs always, `while` a test is true, or once
 * per key `each` names. When the Condition stops holding, its Scope closes.
 */
export type Worker<Model, State, Msg, R extends Requires, Props = void> =
  | {
      readonly while?: never;
      readonly each?: never;
      readonly run: Run<Model, State, Props, Msg, R>;
    }
  | {
      readonly while: (data: Data<Model, State, Props>) => boolean;
      readonly each?: never;
      readonly run: Run<Model, State, Props, Msg, R>;
    }
  | {
      readonly while?: never;
      readonly each: (data: Data<Model, State, Props>) => ReadonlyArray<string>;
      readonly run: Run<Model, State, Props, Msg, R>;
    };

/** Every Worker of one level, by name. */
export type Workers<
  Model,
  State,
  Msg,
  R extends Requires,
  Props = void,
> = Readonly<Record<string, Worker<Model, State, Msg, R, Props>>>;

// Queries -------------------------------------------------------------------------

/** What a Query reads of its Instance: a Worker's Self, without `send`. */
export type QuerySelf<Model, State, Props = void> = Omit<
  Self<Model, State, never, Props>,
  'send'
>;

/**
 * A question an Instance answers from what it holds and what its Services
 * know, without changing anything: it reads its Instance and the
 * Capabilities the Actor Requires, and never Sends. Written at the top it
 * is askable for as long as the Instance lives; in a State's block, only
 * while that State lasts. Its `args`, answer and failure are its own; the
 * Runtime adds `Stopped` to the failure for the caller outside the tree.
 */
export type Query<Model, State, R extends Requires, Props = void> = {
  readonly run: (
    self: QuerySelf<Model, State, Props>,
    args: any,
  ) => Effect.Effect<unknown, unknown, IdsOf<R>>;
};

/** Every Query of one level, by name. */
export type Queries<Model, State, R extends Requires, Props = void> = Readonly<
  Record<string, Query<Model, State, R, Props>>
>;

// Children ------------------------------------------------------------------------

/**
 * When a Child exists, written as a Worker's Condition is: always, `while` a
 * test is true, or once per key `each` names. Where it is written is part of
 * it too: at the top for as long as the Instance lives, in a State's block
 * while that State lasts. A Child that is one, always or `while`, may name a
 * `key`: when it changes, the Child is Invoked again, a fresh Instance.
 */
type Condition<Model, State, Props> =
  | {
      readonly while?: never;
      readonly each?: never;
      readonly key?: (data: Data<Model, State, Props>) => string;
    }
  | {
      readonly while: (data: Data<Model, State, Props>) => boolean;
      readonly each?: never;
      readonly key?: (data: Data<Model, State, Props>) => string;
    }
  | {
      readonly while?: never;
      readonly each: (data: Data<Model, State, Props>) => ReadonlyArray<string>;
      readonly key?: never;
    };

/**
 * What a parent hands one Child, worked out from its data and the Child's
 * key, `''` unless it is one of `each`: its Input, read once, and its Props,
 * read live. Each is required once the Child declares it.
 */
type Given<A, Model, State, Props> = ([Types<A>['input']] extends [void]
  ? {
      readonly input?: (
        data: Data<Model, State, Props>,
        key: string,
      ) => Types<A>['input'];
    }
  : {
      readonly input: (
        data: Data<Model, State, Props>,
        key: string,
      ) => Types<A>['input'];
    }) &
  ([Types<A>['props']] extends [void]
    ? {
        readonly props?: (
          data: Data<Model, State, Props>,
          key: string,
        ) => Types<A>['props'];
      }
    : {
        readonly props: (
          data: Data<Model, State, Props>,
          key: string,
        ) => Types<A>['props'];
      });

/**
 * One Child, checked against the Actor written in it: when it exists, and
 * what it is handed. `C` is the Child as written.
 */
export type Child<Model, State, Props, C> = C extends {
  readonly actor: infer A extends AnyActor;
}
  ? { readonly actor: A } & Given<A, Model, State, Props> &
      Condition<Model, State, Props>
  : { readonly actor: AnyActor };

/** Every Child of one level, by name, each checked against its own Actor. */
export type Children<Model, State, Props, C> = {
  readonly [K in keyof C]: Child<Model, State, Props, C[K]>;
};

/** A Child as written, loosely: what the engine and Views read it as. */
export interface AnyChild {
  readonly actor: AnyActor;
  readonly while?: Function;
  readonly each?: Function;
  readonly key?: Function;
  readonly input?: Function;
  readonly props?: Function;
}

/**
 * Any Child, read only for what its functions are handed: so they are typed
 * from the parent's data even while the Children themselves are inferred.
 */
type Loose<Model, State, Props> = {
  readonly actor: AnyActor;
  readonly while?: (data: Data<Model, State, Props>) => boolean;
  readonly each?: (data: Data<Model, State, Props>) => ReadonlyArray<string>;
  readonly key?: (data: Data<Model, State, Props>) => string;
  readonly input?: (data: Data<Model, State, Props>, key: string) => unknown;
  readonly props?: (data: Data<Model, State, Props>, key: string) => unknown;
};

export type ActorOf<C> = C extends { readonly actor: infer A } ? A : never;

// The behavior ---------------------------------------------------------------------

/** The Children of a level, as written. */
type KidsOf<L> = L extends { readonly children: infer C } ? C : {};

/**
 * One level of an Actor's behavior: the top, for as long as the Instance
 * lives, or one State's block, for as long as that State lasts. `L` is the
 * level as written, so each Child is checked against the Actor written in it.
 */
type Level<
  Model,
  State,
  Props,
  Msg extends Tagged,
  R extends Requires,
  Next,
  L,
> = {
  /** The Capabilities this level gives everything below it, as one Layer. */
  readonly provides?: (
    self: Self<Model, State, Msg, Props>,
  ) => Layer.Layer<any, never, IdsOf<R>>;
  readonly children?: Children<Model, State, Props, KidsOf<L>> &
    Readonly<Record<string, Loose<Model, State, Props>>>;
  /** The Updates: per Message, the next Model and State and the Commands. */
  readonly on?: Rules<Model, State, Props, Msg, R, Next>;
  readonly workers?: Workers<Model, State, Msg, R, Props>;
  /** The questions this level answers from outside the tree, by name. */
  readonly queries?: Queries<Model, State, R, Props>;
};

type ModelInit<Model> = {} extends Model
  ? { readonly model?: Model }
  : { readonly model: Model };

/** The block written for State `T`, if any. */
type BlockOf<B, T extends PropertyKey> = B extends {
  readonly state: { readonly [K in T]: infer L };
}
  ? L
  : {};

/** An Actor declared without a `state` Schema has one State, and no State blocks. */
export type IsSingle<State> = [State] extends [Single] ? true : false;

/**
 * How an Actor is built. `B` is the behavior as written: each Child is
 * checked against the Actor written in it, and what the levels Provide and
 * Invoke becomes the Actor's type.
 */
export type Behavior<
  Input,
  Props,
  Model,
  State extends Tagged,
  Msg extends Tagged,
  R extends Requires,
  B,
> =
  IsSingle<State> extends true
    ? Level<Model, Single, Props, Msg, R, never, B> & {
        readonly state?: never;
      } & ([Input] extends [void]
          ? {} extends Model
            ? { readonly init?: (input: Input) => ModelInit<Model> }
            : { readonly init: (input: Input) => ModelInit<Model> }
          : { readonly init: (input: Input) => ModelInit<Model> })
    : Level<Model, State, Props, Msg, R, State, B> & {
        /** The first Model and State, from the Input. */
        readonly init: (
          input: Input,
        ) => { readonly state: State } & ModelInit<Model>;
        /** One block per State, holding only while it lasts. */
        readonly state?: {
          readonly [T in State['_tag']]?: Level<
            Model,
            Only<State, T>,
            Props,
            Msg,
            R,
            State,
            BlockOf<B, T>
          >;
        };
      };

// What the Actor's type says -------------------------------------------------------

/** The Capabilities a level's `provides` builds. */
export type ProvidedOf<L> = L extends {
  readonly provides: (...args: any) => Layer.Layer<infer P, any, any>;
}
  ? P
  : never;

type OpenOf<A> =
  A extends Actor<any, any, any, any, any, any, any, infer O, any> ? O : never;

/** What the Children of a level still need from above. */
type KidsOpen<C> = { [K in keyof C]: OpenOf<ActorOf<C[K]>> }[keyof C];

/**
 * What an Actor still needs from above: its own Requires, and whatever its
 * Children need that is not Provided where they are placed. A Child's needs
 * bubble up until something Provides them; the app's Layer covers the rest.
 */
export type OpenOfBehavior<R extends Requires, B> =
  | IdsOf<R>
  | Exclude<KidsOpen<KidsOf<B>>, ProvidedOf<B>>
  | (B extends { readonly state: infer S }
      ? {
          [T in keyof S]: Exclude<
            KidsOpen<KidsOf<S[T]>>,
            ProvidedOf<B> | ProvidedOf<S[T]>
          >;
        }[keyof S]
      : never) extends infer O
  ? O
  : never;

/*
 * What an Actor's type keeps of its behavior is only what Views and code
 * outside the tree read: each Child's Actor and kind, each Query's args and
 * answer. Never the behavior as written, which holds every function's type
 * and, through each Child, its whole subtree's: kept, it is printed again in
 * every hover, error and declaration file that names the Actor, once per
 * level it is kept at, so its size grows with each level of Children.
 * Each map is written in place rather than named, so it is printed as its
 * plain shape, never as an alias of the behavior, and stays indexable while
 * its arguments are generic; `BuiltOf` maps over `KidsByState` and
 * `QueriesByState` in place for the same reason.
 */

/** A Child as an Actor's type keeps it: its Actor, and whether it is one of `each` or there `while` a test holds. */
type SlotOf<C> = C extends {
  readonly actor: infer A;
  readonly each: Function;
}
  ? { readonly actor: A; readonly each: Function }
  : C extends { readonly actor: infer A; readonly while: Function }
    ? { readonly actor: A; readonly while: Function }
    : C extends { readonly actor: infer A }
      ? { readonly actor: A }
      : never;

/** The Children per State tag, top-level ones in every State, for Views. */
export type KidsByState<State extends Tagged, B> = {
  readonly [T in State['_tag']]: {
    readonly [K in keyof (KidsOf<B> & KidsOf<BlockOf<B, T>>)]: SlotOf<
      (KidsOf<B> & KidsOf<BlockOf<B, T>>)[K]
    >;
  };
};

/** An Actor's Children in one State, as written: its slots by name. */
export type KidsIn<A, T> = T extends keyof Types<A>['children']
  ? Types<A>['children'][T]
  : {};

/** A Child as its parent finds it, each Instance as `N`: a list of `each`, one that may be absent `while` its test is false, else one always there. */
export type ChildAs<C, N> = C extends { readonly each: Function }
  ? ReadonlyArray<N & { readonly key: string }>
  : C extends { readonly while: Function }
    ? N | undefined
    : N;

/** The Queries of a level, as written. */
type QueriesOf<L> = L extends { readonly queries: infer Q } ? Q : {};

/** A Query as an Actor's type keeps it: its args, answer and failure, not what its `self` reads. */
type AskOf<Q> = Q extends {
  readonly run: (...params: infer P) => Effect.Effect<infer A, infer E, any>;
}
  ? { readonly run: (self: never, ...args: ArgsOf<P>) => Effect.Effect<A, E> }
  : never;

/** The Queries per State tag, top-level ones in every State, for code outside the tree. */
export type QueriesByState<State extends Tagged, B> = {
  readonly [T in State['_tag']]: {
    readonly [K in keyof (QueriesOf<B> & QueriesOf<BlockOf<B, T>>)]: AskOf<
      (QueriesOf<B> & QueriesOf<BlockOf<B, T>>)[K]
    >;
  };
};

/** An Actor's Queries in one State, as written: by name. */
export type QueriesIn<A, T> = T extends keyof Types<A>['queries']
  ? Types<A>['queries'][T]
  : {};

/**
 * A Query as code outside the tree asks it: its args, if its `run` takes
 * any, to an Effect with its answer, failing with its own failure or
 * `Stopped`, and needing nothing, since the Instance supplies its
 * Capabilities. `S` is the Runtime's `Stopped`.
 */
export type QueryAs<Q, S> = Q extends {
  readonly run: (...params: infer P) => Effect.Effect<infer A, infer E, any>;
}
  ? (...args: ArgsOf<P>) => Effect.Effect<A, E | S>
  : never;

/** A Query's `run` parameters without `self`, optional ones kept so. */
type ArgsOf<P> = P extends [any, ...infer Args] ? Args : [];

// What the engine reads ------------------------------------------------------------

/** Throws unless a value matches one of an Actor's Schemas; `what` names it in the error. */
export type Check = (value: unknown, what: string) => void;

/** One of an Actor's Schemas, to save a value as its encoded side and read it back. Both throw on a mismatch; without a Schema, both give the value. */
export interface Encoding {
  readonly encode: (value: unknown) => unknown;
  readonly decode: (value: unknown) => unknown;
}

/** One Child slot, as the engine sees it: when it exists, and what each of its Instances is handed. */
export interface SlotDefinition {
  readonly definition: ActorDefinition;
  /**
   * `always` is held as one Instance; `while`, as one or none; `each`, as a
   * list in the order of its keys.
   */
  readonly kind: 'always' | 'while' | 'each';
  /** Whether its one Instance is held under a key, and Invoked again when it changes. */
  readonly keyed: boolean;
  /** The keys its Condition names for this data; `''` for the one unkeyed Instance of the other kinds. */
  readonly keys: (
    data: Data<unknown, Tagged, unknown>,
  ) => ReadonlyArray<string>;
  /** The Input of a new Instance with this key; read once, as it is Invoked. */
  readonly input: (
    data: Data<unknown, Tagged, unknown>,
    key: string,
  ) => unknown;
  /** The Props of the Instance with this key, worked out again after each of the parent's Updates. */
  readonly props: (
    data: Data<unknown, Tagged, unknown>,
    key: string,
  ) => unknown;
}

/** One Worker, as the engine sees it: which keys its Condition names, and what runs for each. */
export interface WorkerDefinition {
  /** `state` for a Worker that runs always in its State's block. */
  readonly kind: 'instance' | 'state' | 'while' | 'each';
  /** The State whose block it is written in; none for a top-level Worker. */
  readonly state?: string;
  /** The keys the Condition names for this data; `''` for the one Worker of the other kinds. */
  readonly keys: (
    data: Data<unknown, Tagged, unknown>,
  ) => ReadonlyArray<string>;
  readonly run: Function;
}

/** One Query, as the engine sees it: the State it is askable in, if not every one, and what answers. */
export interface QueryDefinition {
  /** The State whose block it is written in; none for a top-level Query. */
  readonly state?: string;
  readonly run: Function;
}

/** The plain definition the engine works from; an Actor without States is keyed by its one State. */
export interface ActorDefinition {
  readonly name: string;
  /** Every State it can be in, by tag: the ones its State Schema names. */
  readonly states: ReadonlyArray<string>;
  readonly requires: Requires;
  /** Throw unless a value matches the Actor's Schema for it. */
  readonly check: {
    readonly input: Check;
    readonly props: Check;
    readonly model: Check;
    readonly state: Check;
    readonly message: Check;
  };
  /** The Schemas a saved History is written and read with: what it holds of an Instance, and its Messages. */
  readonly encoding: {
    readonly props: Encoding;
    readonly model: Encoding;
    readonly state: Encoding;
    readonly message: Encoding;
  };
  readonly init: (input: unknown) => {
    readonly model?: unknown;
    readonly state?: Tagged;
  };
  /** The Updates by State tag, and the top-level ones under `'*'`. */
  readonly update: Readonly<
    Record<string, Readonly<Record<string, Function | undefined>> | undefined>
  >;
  readonly workers: Readonly<Record<string, WorkerDefinition>>;
  readonly queries: Readonly<Record<string, QueryDefinition>>;
  /** The top-level Provide, built once when the Instance starts. */
  readonly provides: Function | undefined;
  /** Each State's Provide, built each time it is entered. */
  readonly stateProvides: Readonly<Record<string, Function | undefined>>;
  /** The Children of each State: the top-level ones, then the State's own. */
  readonly children: Readonly<
    Record<string, Readonly<Record<string, SlotDefinition>> | undefined>
  >;
  /** The slots written at the top: they last as long as the Instance. */
  readonly lasting: ReadonlyArray<string>;
}

declare const types: unique symbol;

export interface Actor<
  out Name extends string,
  out Input,
  out Props,
  out Model,
  out State extends Tagged,
  out Msg extends Tagged,
  out Kids,
  out Needs,
  out Qs = {},
> {
  readonly name: Name;
  readonly definition: ActorDefinition;
  readonly [types]?: {
    readonly input: Input;
    readonly props: Props;
    readonly model: Model;
    readonly state: State;
    readonly message: Msg;
    readonly children: Kids;
    readonly open: Needs;
    readonly queries: Qs;
  };
}

export type AnyActor = Actor<string, any, any, any, any, any, any, any, any>;

/** Everything an Actor's types say, for the Runtime and Views. */
export type Types<A> =
  A extends Actor<
    any,
    infer Input,
    infer Props,
    infer Model,
    infer State,
    infer Msg,
    infer Kids,
    infer Needs,
    infer Qs
  >
    ? {
        input: Input;
        props: Props;
        model: Model;
        state: State;
        message: Msg;
        /** Slots per State tag. */
        children: Kids;
        open: Needs;
        /** Queries per State tag. */
        queries: Qs;
      }
    : never;
