import type { Context, Effect, Schema, Stream } from 'effect';

export type Tagged = { readonly _tag: string };

/** The one State of a Node declared without States. */
export type Single = { readonly _tag: 'Single' };

type AnyKey = Context.Key<any, any>;
export type Requires = Readonly<Record<string, AnyKey>>;

export type ServicesOf<R extends Requires> = {
  readonly [K in keyof R]: R[K] extends Context.Key<any, infer S> ? S : never;
};

type IdsOf<R extends Requires> = {
  [K in keyof R]: R[K] extends Context.Key<infer I, any> ? I : never;
}[keyof R];

export type Only<U, T> = Extract<U, { readonly _tag: T }>;

type Commands<Msg, R extends Requires> = ReadonlyArray<
  Effect.Effect<Msg | void, never, IdsOf<R>>
>;

/** What Update and Lifetimes see: data only. Commands and Lifetimes get Services from Effect. */
type Scope<Model, State> = {
  readonly model: Model;
  readonly state: State;
};

/** What Update also sees: the Message's Time, in milliseconds since the Runtime started. */
type UpdateScope<Model, State> = Scope<Model, State> & { readonly at: number };

type Rules<Model, State, Msg extends Tagged, R extends Requires, Next> = {
  readonly [K in Msg['_tag']]?: (
    message: Only<Msg, K>,
    scope: UpdateScope<Model, State>,
  ) => {
    readonly model?: Model;
    readonly state?: Next;
    readonly commands?: Commands<Msg, R>;
    /** Stop this Node's Commands still running before these start: the latest plan wins. */
    readonly replaceCommands?: boolean;
  };
};

type Lifetime<Model, State, Msg, R extends Requires> = (
  scope: Scope<Model, State>,
) => Stream.Stream<Msg, never, IdsOf<R>>;

/** Builds the Services a State Provides: the one place that reads Service values directly. */
type Provide<Model, State, Msg, R extends Requires, Ids> = (
  scope: Scope<Model, State> & {
    readonly services: ServicesOf<R>;
    readonly send: (message: Msg) => void;
  },
) => Context.Context<Ids>;

/** The Services a Node Provides to the Nodes below it, declared in its shape. */
type Keys = ReadonlyArray<AnyKey>;

type IdsIn<L> =
  L extends ReadonlyArray<infer K>
    ? K extends Context.Key<infer I, any>
      ? I
      : never
    : never;

export type Children = Readonly<Record<string, AnyNode>>;

type ModelInit<Model> = {} extends Model
  ? { readonly model?: Model }
  : { readonly model: Model };

type ProvidesByState<State extends Tagged> = {
  readonly [T in State['_tag']]?: Keys;
};

/** One Provide per State that declares Services, building exactly those Services. */
type ProvidesPart<Model, State extends Tagged, Msg, R extends Requires, Pv> = [
  Pv,
] extends [never]
  ? { readonly provides?: {} }
  : {
      readonly provides: {
        readonly [T in keyof Pv & State['_tag']]: Provide<
          Model,
          Only<State, T>,
          Msg,
          R,
          IdsIn<Pv[T]>
        >;
      };
    };

type ChildrenByState<State extends Tagged> = {
  readonly [T in State['_tag']]?: Children;
};

/** What every Node's definition has: its Requires and Schemas. */
type Common<Model, Msg, R extends Requires> = {
  readonly requires?: R;
  readonly model?: Schema.Schema<Model>;
  readonly message?: Schema.Schema<Msg>;
};

/** A Node declared without a `state` Schema has one State, and every per-State part is written flat. */
export type IsSingle<State> = [State] extends [Single] ? true : false;

/** The definition of a Node: every type, what it Provides and its Children are fixed here. */
export type Shape<
  Model,
  State extends Tagged,
  Msg,
  R extends Requires,
  Pv,
  C,
> = Common<Model, Msg, R> & {
  readonly state?: Schema.Schema<State>;
  readonly provides?: Pv;
  readonly children?: C &
    (IsSingle<State> extends true
      ? Fits<C, IdsOf<R> | IdsIn<Pv>>
      : {
          readonly [T in keyof C]: Fits<
            C[T],
            IdsOf<R> | IdsIn<T extends keyof Pv ? Pv[T] : never>
          >;
        });
};

/** What `provides` may say: a list of Services, or one list per State. */
export type ProvidesFor<State extends Tagged> =
  IsSingle<State> extends true ? Keys : ProvidesByState<State>;

/** What `children` may say: Children, or Children per State. */
export type ChildrenFor<State extends Tagged> =
  IsSingle<State> extends true ? Children : ChildrenByState<State>;

/** How a Node is built: flat without States, keyed by State with them. */
export type Behavior<
  Model,
  State extends Tagged,
  Msg extends Tagged,
  R extends Requires,
  Pv,
> =
  IsSingle<State> extends true
    ? SingleBehavior<Model, Msg, R, Pv>
    : StatesBehavior<Model, State, Msg, R, Pv>;

/** How a Node with States is built: every per-State part is keyed by State. */
type StatesBehavior<
  Model,
  State extends Tagged,
  Msg extends Tagged,
  R extends Requires,
  Pv,
> = ProvidesPart<Model, State, Msg, R, Pv> & {
  readonly init: () => {
    readonly state: State;
    readonly commands?: Commands<Msg, R>;
  } & ModelInit<Model>;
  readonly update?: {
    readonly [T in State['_tag']]?: Rules<Model, Only<State, T>, Msg, R, State>;
  } & { readonly '*'?: Rules<Model, State, Msg, R, State> };
  readonly lifetime?: {
    readonly [T in State['_tag']]?: Lifetime<Model, Only<State, T>, Msg, R>;
  };
};

/** How a Node without States is built: every per-State part is written flat. */
type SingleBehavior<Model, Msg extends Tagged, R extends Requires, Pv> = ([
  Pv,
] extends [never]
  ? { readonly provides?: never }
  : {
      readonly provides: Provide<Model, Single, Msg, R, IdsIn<Pv>>;
    }) & {
  readonly init?: () => {
    readonly commands?: Commands<Msg, R>;
  } & ModelInit<Model>;
  readonly update?: Rules<Model, Single, Msg, R, never>;
  readonly lifetime?: Lifetime<Model, Single, Msg, R>;
};

type OpenOf<N> = N extends Node<any, any, any, any, any, infer O> ? O : never;

/**
 * Each Child must find every Service it needs right where it is placed: in the
 * parent's Requires, or Provided by the parent in that State. A Child that
 * does not is marked with the Services it is missing.
 */
type Fits<C, Has> = {
  readonly [K in keyof C]: [Exclude<OpenOf<C[K]>, Has>] extends [never]
    ? unknown
    : { readonly missingServices: Exclude<OpenOf<C[K]>, Has> };
};

/** Services still needed from above. Children never add to it: they must fit where they are placed. */
export type Open<R extends Requires> = IdsOf<R>;

type At<M, T extends PropertyKey> = M extends { readonly [K in T]?: infer V }
  ? V
  : never;

/** The Children a View sees in each State. */
export type ChildrenOf<Tags extends string, C> = {
  readonly [T in Tags]: At<C, T> extends Children ? At<C, T> : {};
};

/** The plain definition the Runtime works from; a Node without States is keyed by its one State. */
export interface Definition {
  readonly name: string;
  readonly requires: Requires;
  readonly init: () => {
    readonly model?: unknown;
    readonly state?: Tagged;
    readonly commands?: ReadonlyArray<Effect.Effect<unknown, never, any>>;
  };
  readonly update: Readonly<
    Record<string, Readonly<Record<string, Function | undefined>> | undefined>
  >;
  readonly lifetime: Readonly<Record<string, Function | undefined>>;
  readonly provides: Readonly<Record<string, Function | undefined>>;
  readonly children: Readonly<Record<string, Children | undefined>>;
}

declare const types: unique symbol;

export interface Node<
  out Name extends string,
  out Model,
  out State extends Tagged,
  out Msg extends Tagged,
  out Kids,
  out Needs,
> {
  readonly name: Name;
  readonly definition: Definition;
  readonly [types]?: {
    readonly model: Model;
    readonly state: State;
    readonly message: Msg;
    readonly children: Kids;
    readonly open: Needs;
  };
}

export type AnyNode = Node<string, any, any, any, any, any>;

/** Everything a Node's types say, for the Runtime and Views. */
export type Types<N> =
  N extends Node<
    any,
    infer Model,
    infer State,
    infer Msg,
    infer Kids,
    infer Needs
  >
    ? {
        model: Model;
        state: State;
        message: Msg;
        children: Kids;
        open: Needs;
      }
    : never;
