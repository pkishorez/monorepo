import type { Context, Effect, Layer, Schema, Scope, Stream } from 'effect';

export type Tagged = { readonly _tag: string };

/** The one State of an Actor declared without States. */
export type Single = { readonly _tag: 'Single' };

type AnyKey = Context.Key<any, any>;
export type Requires = Readonly<Record<string, AnyKey>>;

type IdsOf<R extends Requires> = {
  [K in keyof R]: R[K] extends Context.Key<infer I, any> ? I : never;
}[keyof R];

export type Only<U, T> = Extract<U, { readonly _tag: T }>;

/** An Instance's data at one moment. */
export type Data<Model, State> = {
  readonly model: Model;
  readonly state: State;
};

/**
 * What an Instance's own work holds of it: Lifetimes, Commands and Provides.
 * Sends go only to this Instance; `get` and `changes` are always current.
 */
export interface Self<Model, State, Msg> {
  readonly id: string;
  readonly send: (message: Msg) => Effect.Effect<void>;
  readonly get: Effect.Effect<Data<Model, State>>;
  /** The current data, then each new value after a Message changes it. */
  readonly changes: Stream.Stream<Data<Model, State>>;
}

/** Work that may end with a Message, which is then Sent to its Instance. */
type Run<Model, State, Msg, R extends Requires> =
  | Effect.Effect<Msg | void, never, IdsOf<R>>
  | ((
      self: Self<Model, State, Msg>,
    ) => Effect.Effect<Msg | void, never, IdsOf<R> | Scope.Scope>);

/**
 * One piece of work an Update asks for, owned by its Instance. Started under a
 * key, it interrupts the Command still running under the same key.
 */
export type Command<Model, State, Msg, R extends Requires> =
  | Run<Model, State, Msg, R>
  | { readonly key: string; readonly run: Run<Model, State, Msg, R> };

type Rules<Model, State, Msg extends Tagged, R extends Requires, Next, All> = {
  readonly [K in Msg['_tag']]?: (
    message: Only<Msg, K>,
    scope: Data<Model, State> & {
      /** The Message's Time, in milliseconds since the Runtime started. */
      readonly at: number;
    },
  ) => {
    readonly model?: Model;
    readonly state?: Next;
    readonly command?: Command<Model, All, Msg, R>;
    /** Interrupt the Commands running under these keys, before `command` starts. */
    readonly cancel?: string | ReadonlyArray<string>;
  };
};

/** Work for as long as an Instance exists, or is in one State: a scoped Effect. */
type Lifetime<Model, State, Msg, R extends Requires> = (
  self: Self<Model, State, Msg>,
) => Effect.Effect<unknown, never, IdsOf<R> | Scope.Scope>;

/** Builds what a State Provides, once each time the State is entered. */
type Provide<Model, State, Msg, R extends Requires, Ids> = (
  self: Self<Model, State, Msg>,
) => Layer.Layer<Ids, never, IdsOf<R>>;

type Keys = ReadonlyArray<AnyKey>;

type IdsIn<L> =
  L extends ReadonlyArray<infer K>
    ? K extends Context.Key<infer I, any>
      ? I
      : never
    : never;

// Children ------------------------------------------------------------------------

/** A keyed Child: one Instance of `actor` per key the parent Invokes. */
export interface Many<A extends AnyActor> {
  readonly _tag: 'Many';
  readonly actor: A;
}

export type Slot = AnyActor | Many<AnyActor>;
export type Children = Readonly<Record<string, Slot>>;

export type ActorOf<S> = S extends Many<infer A> ? A : S;

type InputOf<A> = Types<A>['input'];

type Keyed<I> = [I] extends [void]
  ? { readonly key: string; readonly input?: I }
  : { readonly key: string; readonly input: I };

type ManyKeys<C> = {
  [K in keyof C]: C[K] extends Many<any> ? K : never;
}[keyof C];
type NeedKeys<C> = {
  [K in keyof C]: C[K] extends Many<any>
    ? never
    : [InputOf<C[K]>] extends [void]
      ? never
      : K;
}[keyof C];
type FreeKeys<C> = Exclude<keyof C, ManyKeys<C> | NeedKeys<C>>;

/** What a State Invokes: the keys and Input of each keyed Child, and the Input of each fixed one. */
export type Invocation<C> = {
  readonly [K in ManyKeys<C>]: ReadonlyArray<Keyed<InputOf<ActorOf<C[K]>>>>;
} & { readonly [K in NeedKeys<C>]: InputOf<C[K]> } & {
  readonly [K in FreeKeys<C>]?: InputOf<C[K]>;
};

type Invoke<Model, State, C> = (data: Data<Model, State>) => Invocation<C>;

type InvokesByState<Model, State extends Tagged, CS> = {
  readonly [
    T in keyof CS & State['_tag'] as {} extends Invocation<CS[T]> ? never : T
  ]: Invoke<Model, Only<State, T>, CS[T]>;
} & {
  readonly [
    T in keyof CS & State['_tag'] as {} extends Invocation<CS[T]> ? T : never
  ]?: Invoke<Model, Only<State, T>, CS[T]>;
};

type InvokePart<Part> = {} extends Part
  ? { readonly invoke?: Part }
  : { readonly invoke: Part };

// The definition ---------------------------------------------------------------------

type ModelInit<Model> = {} extends Model
  ? { readonly model?: Model }
  : { readonly model: Model };

type ProvidesByState<State extends Tagged> = {
  readonly [T in State['_tag']]?: Keys;
};

/** One Provide per State that declares Capabilities, building exactly those. */
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

/** An Actor declared without a `state` Schema has one State, and every per-State part is written flat. */
export type IsSingle<State> = [State] extends [Single] ? true : false;

/** Children keyed by State, also for an Actor without States. */
export type ByState<State, C> =
  IsSingle<State> extends true ? { Single: C } : C;

/** The definition of an Actor: every type, what it Provides and its Children are fixed here. */
export type Shape<
  Input,
  Model,
  State extends Tagged,
  Msg,
  R extends Requires,
  Pv,
  C,
> = {
  readonly requires?: R;
  /** What a parent hands this Actor when it Invokes it. */
  readonly input?: Schema.Schema<Input>;
  readonly model?: Schema.Schema<Model>;
  readonly message?: Schema.Schema<Msg>;
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

/** What `provides` may say: a list of Capabilities, or one list per State. */
export type ProvidesFor<State extends Tagged> =
  IsSingle<State> extends true ? Keys : ProvidesByState<State>;

/** What `children` may say: Children, or Children per State. */
export type ChildrenFor<State extends Tagged> =
  IsSingle<State> extends true ? Children : ChildrenByState<State>;

/** How an Actor is built: flat without States, keyed by State with them. */
export type Behavior<
  Input,
  Model,
  State extends Tagged,
  Msg extends Tagged,
  R extends Requires,
  Pv,
  C,
> =
  IsSingle<State> extends true
    ? SingleBehavior<Input, Model, Msg, R, Pv, C>
    : StatesBehavior<Input, Model, State, Msg, R, Pv, C>;

/** How an Actor with States is built: every per-State part is keyed by State. */
type StatesBehavior<
  Input,
  Model,
  State extends Tagged,
  Msg extends Tagged,
  R extends Requires,
  Pv,
  C,
> = ProvidesPart<Model, State, Msg, R, Pv> &
  InvokePart<InvokesByState<Model, State, C>> & {
    /** The first Model and State, from the Input. */
    readonly init: (
      input: Input,
    ) => { readonly state: State } & ModelInit<Model>;
    readonly update?: {
      readonly [T in State['_tag']]?: Rules<
        Model,
        Only<State, T>,
        Msg,
        R,
        State,
        State
      >;
    } & { readonly '*'?: Rules<Model, State, Msg, R, State, State> };
    /** `'*'` runs for as long as the Instance exists; each State's, while it lasts. */
    readonly lifetime?: {
      readonly [T in State['_tag']]?: Lifetime<Model, Only<State, T>, Msg, R>;
    } & { readonly '*'?: Lifetime<Model, State, Msg, R> };
  };

/** How an Actor without States is built: every per-State part is written flat. */
type SingleBehavior<
  Input,
  Model,
  Msg extends Tagged,
  R extends Requires,
  Pv,
  C,
> = ([Pv] extends [never]
  ? { readonly provides?: never }
  : { readonly provides: Provide<Model, Single, Msg, R, IdsIn<Pv>> }) &
  ({} extends Invocation<C>
    ? { readonly invoke?: Invoke<Model, Single, C> }
    : { readonly invoke: Invoke<Model, Single, C> }) &
  ([Input] extends [void]
    ? {} extends Model
      ? { readonly init?: (input: Input) => ModelInit<Model> }
      : { readonly init: (input: Input) => ModelInit<Model> }
    : { readonly init: (input: Input) => ModelInit<Model> }) & {
    readonly update?: Rules<Model, Single, Msg, R, never, Single>;
    readonly lifetime?: Lifetime<Model, Single, Msg, R>;
  };

type OpenOf<A> =
  A extends Actor<any, any, any, any, any, any, infer O> ? O : never;

/**
 * Each Child must find every Capability it needs right where it is placed: in
 * the parent's Requires, or Provided by the parent in that State. A Child that
 * does not is marked with the Capabilities it is missing.
 */
type Fits<C, Has> = {
  readonly [K in keyof C]: [Exclude<OpenOf<ActorOf<C[K]>>, Has>] extends [never]
    ? unknown
    : { readonly missingCapabilities: Exclude<OpenOf<ActorOf<C[K]>>, Has> };
};

/** Capabilities still needed from above. Children never add to it: they must fit where they are placed. */
export type Open<R extends Requires> = IdsOf<R>;

// What the engine reads ------------------------------------------------------------

/** One Child slot, as the engine sees it. */
export interface SlotDefinition {
  readonly definition: Definition;
  readonly many: boolean;
}

/** The plain definition the engine works from; an Actor without States is keyed by its one State. */
export interface Definition {
  readonly name: string;
  readonly requires: Requires;
  readonly init: (input: unknown) => {
    readonly model?: unknown;
    readonly state?: Tagged;
  };
  readonly update: Readonly<
    Record<string, Readonly<Record<string, Function | undefined>> | undefined>
  >;
  /** Keyed by State, and `'*'` for the whole Instance. */
  readonly lifetime: Readonly<Record<string, Function | undefined>>;
  readonly provides: Readonly<Record<string, Function | undefined>>;
  readonly children: Readonly<
    Record<string, Readonly<Record<string, SlotDefinition>> | undefined>
  >;
  readonly invoke: Readonly<Record<string, Function | undefined>>;
}

declare const types: unique symbol;

export interface Actor<
  out Name extends string,
  out Input,
  out Model,
  out State extends Tagged,
  out Msg extends Tagged,
  out Kids,
  out Needs,
> {
  readonly name: Name;
  readonly definition: Definition;
  readonly [types]?: {
    readonly input: Input;
    readonly model: Model;
    readonly state: State;
    readonly message: Msg;
    readonly children: Kids;
    readonly open: Needs;
  };
}

export type AnyActor = Actor<string, any, any, any, any, any, any>;

/** Everything an Actor's types say, for the Runtime and Views. */
export type Types<A> =
  A extends Actor<
    any,
    infer Input,
    infer Model,
    infer State,
    infer Msg,
    infer Kids,
    infer Needs
  >
    ? {
        input: Input;
        model: Model;
        state: State;
        message: Msg;
        /** Slots per State tag. */
        children: Kids;
        open: Needs;
      }
    : never;
