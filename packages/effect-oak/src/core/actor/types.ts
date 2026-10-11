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

/** An Instance's data at one moment. */
export type Data<Model, State> = {
  readonly model: Model;
  readonly state: State;
};

/**
 * What an Instance's own work holds of it: Workers and Provides. Sends go
 * only to this Instance; `get` and `changes` are always current.
 */
export interface Self<Model, State, Msg> {
  readonly id: string;
  readonly send: (message: Msg) => Effect.Effect<void>;
  readonly get: Effect.Effect<Data<Model, State>>;
  /** The current data, then each new value after a Message changes it. */
  readonly changes: Stream.Stream<Data<Model, State>>;
  /**
   * The app's Time now, in milliseconds since the Runtime started: the clock
   * Messages are stamped with, which stands still while stopped. A Worker
   * that waits until a Time in the Model sleeps for `that - now`, so it waits
   * only what is left when it starts again on a resume or a fork.
   */
  readonly now: Effect.Effect<number>;
}

/**
 * An errand an Update asks for: one named Effect that ends with at most one
 * Message, Sent to its Instance. Nothing stops it but its Instance stopping;
 * work that must be stopped, show progress or survive a stop is a Worker.
 */
export interface Command<Msg, R extends Requires> {
  readonly name: string;
  readonly run: Effect.Effect<Msg | void, never, IdsOf<R>>;
}

/** The Updates of one level, by Message tag. */
type Rules<Model, State, Msg extends Tagged, R extends Requires, Next> = {
  readonly [K in Msg['_tag']]?: (
    message: Only<Msg, K>,
    scope: Data<Model, State> & {
      /** The Message's Time, in milliseconds since the Runtime started. */
      readonly at: number;
    },
  ) => {
    readonly model?: Model;
    readonly state?: Next;
    /** The Commands to run, concurrently. */
    readonly command?: Command<Msg, R> | ReadonlyArray<Command<Msg, R>>;
  };
};

/** A Worker's Effect: scoped, Sending its Instance, given the key it runs for. */
type Run<Model, State, Msg, R extends Requires> = (
  self: Self<Model, State, Msg>,
  key: string,
) => Effect.Effect<unknown, never, IdsOf<R> | Scope.Scope>;

/**
 * Work that runs for exactly as long as its Condition holds, read from the
 * Instance's own data after every Update. Where it is written is part of the
 * Condition: at the top it is owned by the Instance, in a State's block by
 * that State. Inside that, it runs always, `while` a test is true, or once
 * per key `each` names. When the Condition stops holding, its Scope closes.
 */
export type Worker<Model, State, Msg, R extends Requires> =
  | {
      readonly while?: never;
      readonly each?: never;
      readonly run: Run<Model, State, Msg, R>;
    }
  | {
      readonly while: (data: Data<Model, State>) => boolean;
      readonly each?: never;
      readonly run: Run<Model, State, Msg, R>;
    }
  | {
      readonly while?: never;
      readonly each: (data: Data<Model, State>) => ReadonlyArray<string>;
      readonly run: Run<Model, State, Msg, R>;
    };

/** Every Worker of one level, by name. */
export type Workers<Model, State, Msg, R extends Requires> = Readonly<
  Record<string, Worker<Model, State, Msg, R>>
>;

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

/** What a level Invokes: the keys and Input of each keyed Child, and the Input of each fixed one. */
export type Invocation<C> = {
  readonly [K in ManyKeys<C>]: ReadonlyArray<Keyed<InputOf<ActorOf<C[K]>>>>;
} & { readonly [K in NeedKeys<C>]: InputOf<C[K]> } & {
  readonly [K in FreeKeys<C>]?: InputOf<C[K]>;
};

// The behavior ---------------------------------------------------------------------

/** The Children a level, as written, Invokes. */
type KidsOf<L> = L extends { readonly children: infer C } ? C : {};

/** `invoke` is required once a level has a Child that needs keys or Input. */
type InvokePart<Model, State, C> =
  {} extends Invocation<C>
    ? { readonly invoke?: (data: Data<Model, State>) => Invocation<C> }
    : { readonly invoke: (data: Data<Model, State>) => Invocation<C> };

/**
 * One level of an Actor's behavior: the top, for as long as the Instance
 * lives, or one State's block, for as long as that State lasts. `L` is the
 * level as written, so `invoke` is checked against the `children` beside it.
 */
type Level<Model, State, Msg extends Tagged, R extends Requires, Next, L> = {
  /** The Capabilities this level gives everything below it, as one Layer. */
  readonly provides?: (
    self: Self<Model, State, Msg>,
  ) => Layer.Layer<any, never, IdsOf<R>>;
  readonly children?: Children;
  /** The Updates: per Message, the next Model and State and the Commands. */
  readonly on?: Rules<Model, State, Msg, R, Next>;
  readonly workers?: Workers<Model, State, Msg, R>;
} & InvokePart<Model, State, KidsOf<L>>;

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
 * How an Actor is built. `B` is the behavior as written: each level's
 * `invoke` is checked against its own `children`, and what the levels
 * Provide and Invoke becomes the Actor's type.
 */
export type Behavior<
  Input,
  Model,
  State extends Tagged,
  Msg extends Tagged,
  R extends Requires,
  B,
> =
  IsSingle<State> extends true
    ? Level<Model, Single, Msg, R, never, B> & {
        readonly state?: never;
      } & ([Input] extends [void]
          ? {} extends Model
            ? { readonly init?: (input: Input) => ModelInit<Model> }
            : { readonly init: (input: Input) => ModelInit<Model> }
          : { readonly init: (input: Input) => ModelInit<Model> })
    : Level<Model, State, Msg, R, State, B> & {
        /** The first Model and State, from the Input. */
        readonly init: (
          input: Input,
        ) => { readonly state: State } & ModelInit<Model>;
        /** One block per State, holding only while it lasts. */
        readonly state?: {
          readonly [T in State['_tag']]?: Level<
            Model,
            Only<State, T>,
            Msg,
            R,
            State,
            BlockOf<B, T>
          >;
        };
      };

// What the Actor's type says -------------------------------------------------------

/** The Capabilities a level's `provides` builds. */
type ProvidedOf<L> = L extends {
  readonly provides: (...args: any) => Layer.Layer<infer P, any, any>;
}
  ? P
  : never;

type OpenOf<A> =
  A extends Actor<any, any, any, any, any, any, infer O> ? O : never;

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
      : never);

/** The Children per State tag, top-level ones in every State, for Views. */
export type KidsByState<State extends Tagged, B> = {
  readonly [T in State['_tag']]: KidsOf<B> & KidsOf<BlockOf<B, T>>;
};

// What the engine reads ------------------------------------------------------------

/** One Child slot, as the engine sees it. */
export interface SlotDefinition {
  readonly definition: Definition;
  readonly many: boolean;
}

/** One Worker, as the engine sees it: which keys its Condition names, and what runs for each. */
export interface WorkerDefinition {
  /** `state` for a Worker that runs always in its State's block. */
  readonly kind: 'instance' | 'state' | 'while' | 'each';
  /** The State whose block it is written in; none for a top-level Worker. */
  readonly state?: string;
  /** The keys the Condition names for this data; `''` for the one Worker of the other kinds. */
  readonly keys: (data: Data<unknown, Tagged>) => ReadonlyArray<string>;
  readonly run: Function;
}

/** The plain definition the engine works from; an Actor without States is keyed by its one State. */
export interface Definition {
  readonly name: string;
  /** Every State it can be in, by tag: the ones its State Schema names. */
  readonly states: ReadonlyArray<string>;
  readonly requires: Requires;
  readonly init: (input: unknown) => {
    readonly model?: unknown;
    readonly state?: Tagged;
  };
  /** The Updates by State tag, and the top-level ones under `'*'`. */
  readonly update: Readonly<
    Record<string, Readonly<Record<string, Function | undefined>> | undefined>
  >;
  readonly workers: Readonly<Record<string, WorkerDefinition>>;
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
  /** What each State Invokes, the top-level Invocation included. */
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
