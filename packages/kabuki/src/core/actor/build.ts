import type { Effect, Layer, Scope } from 'effect';
import type { Command } from './command.ts';
import type { ActorType as Actor, AnyActor, Types } from './define.ts';
import type {
  Data,
  IdsOf,
  Only,
  Requires,
  Self,
  Single,
  Tagged,
} from './self.ts';

/*
 * How an Actor is written in its definition's `build`: its Updates,
 * Workers, answers to its Queries and Children, level by level, what its
 * needs bubble up as, and what the Actor's type keeps of it.
 */

/** The Updates of one level, by Message tag. */
export type Rules<
  Model,
  State,
  Props,
  Msg extends Tagged,
  R extends Requires,
  Next,
  Emits extends Tagged = never,
> = {
  readonly [K in Msg['_tag']]?: (
    message: Only<Msg, K>,
    scope: Data<Model, State, Props> & {
      /** The Message's Time, in milliseconds since the Runtime started. */
      readonly at: number;
    },
  ) => {
    /** The fields of the Model that change; the rest stay as they are. */
    readonly model?: Partial<Model>;
    readonly state?: Next;
    /** What to tell the parent, each turned into one of its Messages by the Child's slot. */
    readonly emit?: Emits | ReadonlyArray<Emits>;
    /** The Commands to run, concurrently. */
    readonly command?:
      | Command<Msg | void, IdsOf<R>>
      | ReadonlyArray<Command<Msg | void, IdsOf<R>>>;
  };
};

/** A Worker's Effect: scoped, Sending its Instance, given the key it runs for. */
export type Run<Model, State, Props, Msg, R extends Requires> = (
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

/** A Query as `define` declares it: what it is asked with, and what it answers. */
export type Declared = { readonly args: unknown; readonly result: unknown };

/** Every Query an Actor declares, by name. */
export type DeclaredQueries = { readonly [name: string]: Declared };

/**
 * How an Instance answers a Query it declares: from what it holds and what
 * its Services know, without changing anything. It reads its Instance and
 * the Capabilities the Actor Requires, and never Sends. Written at the top
 * it is askable for as long as the Instance lives; in a State's block, only
 * while that State lasts. Its failure is its own; the Runtime adds `Stopped`
 * for the caller outside the tree.
 */
export type Answer<
  Model,
  State,
  R extends Requires,
  Props,
  Q extends Declared,
> = (
  self: QuerySelf<Model, State, Props>,
  args: Q['args'],
) => Effect.Effect<Q['result'], any, IdsOf<R>>;

/** The answers of one level, by the name its Query is declared by. */
export type Queries<
  Model,
  State,
  R extends Requires,
  Props,
  Qs extends DeclaredQueries,
> = { readonly [K in keyof Qs]?: Answer<Model, State, R, Props, Qs[K]> };

// Children ------------------------------------------------------------------------

/**
 * What a parent hands one Child, worked out from its data and the Child's
 * key, `''` unless it is one of `each`: its Input, read once, and its Props,
 * read live. Each is required once the Child declares it.
 */
export type Given<A, D> = ([Types<A>['input']] extends [void]
  ? { readonly input?: (data: D, key: string) => Types<A>['input'] }
  : { readonly input: (data: D, key: string) => Types<A>['input'] }) &
  ([Types<A>['props']] extends [void]
    ? { readonly props?: (data: D, key: string) => Types<A>['props'] }
    : { readonly props: (data: D, key: string) => Types<A>['props'] });

/**
 * What the parent hears from one Child: for each thing the Child Emits, the
 * parent's own Message it becomes, given the Child's key, `''` unless it is
 * one of `each`. One left out is not heard.
 */
export type Hears<A, Msg> = [Types<A>['emits']] extends [never]
  ? { readonly emits?: never }
  : {
      readonly emits?: {
        readonly [K in Extract<Types<A>['emits'], Tagged>['_tag']]?: (
          event: Only<Types<A>['emits'], K>,
          key: string,
        ) => Msg;
      };
    };

/** What `Actor.child` takes besides the Actor, but when it exists: what it is handed, and what the parent hears from it. */
export type ChildOptions<A, D, Msg> = Given<A, D> & Hears<A, Msg>;

declare const made: unique symbol;

/**
 * Anything `Actor.child` made, for a level whose data is `D` and whose
 * Messages are `Msg`: a level's Children are made with it, never written by
 * hand. Both are read from where it is written, so its functions are typed
 * by the level they sit in.
 */
export interface Made<D = any, Msg = any> {
  readonly actor: AnyActor;
  /**
   * Required, and only `Actor.child` makes it, so a Child written by hand
   * does not compile. It reads the level's data and gives its Messages: a
   * Child made for a narrower level, or one whose Emits become Messages the
   * parent does not have, does not fit.
   */
  readonly [made]: (data: D) => Msg;
}

/** What a Child's slot gives its parent: its Messages, or nothing for a Child that Emits nothing. */
type Heard<A, Msg> = [Types<A>['emits']] extends [never] ? never : Msg;

/** A Child as `Actor.child` makes it, as its parent's type keeps it: its Actor, and whether it is one of `each` or there `while` a test holds. */
export type Slot<
  A,
  Kind extends 'always' | 'while' | 'each' = 'always',
  D = any,
  Msg = any,
> = {
  readonly actor: A;
  readonly [made]: (data: D) => Heard<A, Msg>;
} & (Kind extends 'each'
  ? { readonly each: Function }
  : Kind extends 'while'
    ? { readonly while: Function }
    : {});

/** Whether a Child needs nothing from its parent: no Input and no Props. */
type Bare<A> = [Types<A>['input'], Types<A>['props']] extends [void, void]
  ? true
  : false;

/**
 * Makes one Child of a level: the Actor it is, then when it exists, what
 * it is handed and what the parent hears from it. Every function is typed
 * from the parent's data at the level it is written in, its State narrowed
 * in a State's block, and checked against the Actor: its Input, its Props,
 * and what it Emits, each turned into one of the parent's Messages.
 *
 * - Always, with neither `while` nor `each`: one Instance, for as long as
 *   its level lasts.
 * - `while` a test is true: one Instance or none.
 * - `each` key a function names: one Instance per key, in their order.
 *
 * One that is always or `while` may name a `key`: when it changes, the
 * Child is Invoked again, a fresh Instance.
 */
export interface MakeChild {
  <A extends AnyActor, D, Msg>(
    actor: A,
    options: ChildOptions<A, NoInfer<D>, NoInfer<Msg>> & {
      readonly each: (data: NoInfer<D>) => ReadonlyArray<string>;
      readonly while?: never;
      readonly key?: never;
    },
  ): Slot<A, 'each', D, Msg>;
  <A extends AnyActor, D, Msg>(
    actor: A,
    options: ChildOptions<A, NoInfer<D>, NoInfer<Msg>> & {
      readonly while: (data: NoInfer<D>) => boolean;
      readonly each?: never;
      readonly key?: (data: NoInfer<D>) => string;
    },
  ): Slot<A, 'while', D, Msg>;
  <A extends AnyActor, D, Msg>(
    actor: A,
    ...options: Bare<A> extends true
      ? [options?: Always<A, NoInfer<D>, NoInfer<Msg>>]
      : [options: Always<A, NoInfer<D>, NoInfer<Msg>>]
  ): Slot<A, 'always', D, Msg>;
}

/** The options of a Child that is always there. */
type Always<A, D, Msg> = ChildOptions<A, D, Msg> & {
  readonly while?: never;
  readonly each?: never;
  readonly key?: (data: D) => string;
};

/** A Child as `Actor.child` makes it, loosely: what the engine and Views read it as. */
export interface AnyChild {
  readonly actor: AnyActor;
  readonly while?: Function;
  readonly each?: Function;
  readonly key?: Function;
  readonly input?: Function;
  readonly props?: Function;
  readonly emits?: Readonly<Record<string, Function | undefined>>;
}

export type ActorOf<C> = C extends { readonly actor: infer A } ? A : never;

// The behavior ---------------------------------------------------------------------

/** The Children of a level, as its `children` names them. */
export type KidsOf<L> = L extends { readonly children: infer C } ? C : {};

/**
 * One level of an Actor's behavior: the top, for as long as the Instance
 * lives, or one State's block, for as long as that State lasts.
 */
export type Level<
  Model,
  State,
  Props,
  Msg extends Tagged,
  R extends Requires,
  Next,
  Emits extends Tagged = never,
  Qs extends DeclaredQueries = {},
> = {
  /**
   * The Capabilities this level gives everything below it: their keys, and
   * the one Layer that builds exactly those, from what the Actor Requires.
   * Only the ones named reach below.
   */
  readonly provides?: {
    readonly capabilities: Requires;
    readonly layer: (
      self: Self<Model, State, Msg, Props>,
    ) => Layer.Layer<any, never, IdsOf<R>>;
  };
  /** The Children of this level, each made with `Actor.child`, by name. */
  readonly children?: Readonly<
    Record<string, Made<Data<Model, State, Props>, Msg>>
  >;
  /** The Updates: per Message, the Model's changes, the next State, the Commands and what to Emit. */
  readonly on?: Rules<Model, State, Props, Msg, R, Next, Emits>;
  readonly workers?: Workers<Model, State, Msg, R, Props>;
  /** How this level answers the Queries `define` declares, by name. */
  readonly queries?: Queries<Model, State, R, Props, Qs>;
};

export type ModelInit<Model> = {} extends Model
  ? { readonly model?: Model }
  : { readonly model: Model };

/** The block written for State `T`, if any. */
export type BlockOf<B, T extends PropertyKey> = B extends {
  readonly states: { readonly [K in T]: infer L };
}
  ? L
  : {};

/** An Actor declared without a `state` Schema has one State, and no State blocks. */
export type IsSingle<State> = [State] extends [Single] ? true : false;

/**
 * How an Actor is built: its init, and its levels, the top and one block per
 * State. What the levels Provide and Invoke, as written, becomes the
 * Actor's type.
 */
export type Behavior<
  Input,
  Props,
  Model,
  State extends Tagged,
  Msg extends Tagged,
  R extends Requires,
  Emits extends Tagged = never,
  Qs extends DeclaredQueries = {},
> =
  IsSingle<State> extends true
    ? Level<Model, Single, Props, Msg, R, never, Emits, Qs> & {
        readonly states?: never;
      } & ([Input] extends [void]
          ? {} extends Model
            ? { readonly init?: (input: Input) => ModelInit<Model> }
            : { readonly init: (input: Input) => ModelInit<Model> }
          : { readonly init: (input: Input) => ModelInit<Model> })
    : Level<Model, State, Props, Msg, R, State, Emits, Qs> & {
        /** The first Model and State, from the Input. */
        readonly init: (
          input: Input,
        ) => { readonly state: State } & ModelInit<Model>;
        /** One block per State, holding only while it lasts. */
        readonly states?: {
          readonly [T in State['_tag']]?: Level<
            Model,
            Only<State, T>,
            Props,
            Msg,
            R,
            State,
            Emits,
            Qs
          >;
        };
      };

/** The names a level answers that `define` does not declare. */
type ExtraQueries<L, Qs> = L extends { readonly queries: infer Q }
  ? Exclude<keyof Q, keyof Qs>
  : never;

/**
 * Refuses a behavior that answers a Query `define` does not declare, at the
 * top or in any State's block, naming it; nothing for one that does not.
 */
export type Undeclared<B, Qs> = [
  | ExtraQueries<B, Qs>
  | (B extends { readonly states: infer S }
      ? { [T in keyof S]-?: ExtraQueries<NonNullable<S[T]>, Qs> }[keyof S]
      : never),
] extends [infer Extra]
  ? [Extra] extends [never]
    ? unknown
    : { readonly 'answers a Query `define` does not declare': Extra }
  : never;

/**
 * What is wrong with a level's Provides, if anything: a Capability it
 * names that its Layer does not build, or one its Layer builds that it does
 * not name. Effect lets a Layer that builds more pass for one that builds
 * less, so both are checked here.
 */
type Misprovided<L> = L extends {
  readonly provides: {
    readonly capabilities: infer C extends Requires;
    readonly layer: (...args: any) => Layer.Layer<infer P, any, any>;
  };
}
  ? 0 extends 1 & P
    ? never
    : [Exclude<IdsOf<C>, P>] extends [never]
      ? [Exclude<P, IdsOf<C>>] extends [never]
        ? never
        : {
            readonly 'its Layer builds a Capability `capabilities` does not name': Exclude<
              P,
              IdsOf<C>
            >;
          }
      : {
          readonly 'names a Capability its Layer does not build': Exclude<
            IdsOf<C>,
            P
          >;
        }
  : never;

/**
 * Refuses a level whose Layer does not build exactly the Capabilities it
 * names, at the top or in any State's block, at its `provides`; nothing for
 * a behavior whose every level does.
 */
export type Unprovided<B> = ([Misprovided<B>] extends [never]
  ? unknown
  : { readonly provides: Misprovided<B> }) &
  (B extends { readonly states: infer S }
    ? [{ [T in keyof S]-?: Misprovided<NonNullable<S[T]>> }[keyof S]] extends [
        never,
      ]
      ? unknown
      : {
          readonly states: {
            readonly [
              T in keyof S as [Misprovided<NonNullable<S[T]>>] extends [never]
                ? never
                : T
            ]: { readonly provides: Misprovided<NonNullable<S[T]>> };
          };
        }
    : unknown);

/** The slots a State's block names that the top names too. */
type Again<B, L> = Extract<keyof KidsOf<L>, keyof KidsOf<B>>;

/**
 * Refuses a State's Child whose slot name a top-level Child already has: a
 * slot name is used once per Actor. Nothing for a behavior without one.
 */
export type Doubled<B> = B extends { readonly states: infer S }
  ? [{ [T in keyof S]-?: Again<B, NonNullable<S[T]>> }[keyof S]] extends [never]
    ? unknown
    : {
        readonly states: {
          readonly [
            T in keyof S as [Again<B, NonNullable<S[T]>>] extends [never]
              ? never
              : T
          ]: {
            readonly children: {
              readonly [K in Again<B, NonNullable<S[T]>>]: {
                readonly 'is a slot name the top already has: each is used once per Actor': K;
              };
            };
          };
        };
      }
  : unknown;

// What the Actor's type says -------------------------------------------------------

/** The Capabilities a level's `provides` names: all that reaches below it. */
export type ProvidedOf<L> = L extends {
  readonly provides: { readonly capabilities: infer C extends Requires };
}
  ? IdsOf<C>
  : never;

export type OpenOf<A> =
  A extends Actor<any, any, any, any, any, any, any, infer O, any, any>
    ? O
    : never;

/** What the Children of a level still need from above. */
export type KidsOpen<C> = { [K in keyof C]: OpenOf<ActorOf<C[K]>> }[keyof C];

/**
 * What an Actor still needs from above: its own Requires, and whatever its
 * Children need that is not Provided where they are placed. A Child's needs
 * bubble up until something Provides them; the app's Layer covers the rest.
 */
export type OpenOfBehavior<R extends Requires, B> =
  | IdsOf<R>
  | Exclude<KidsOpen<KidsOf<B>>, ProvidedOf<B>>
  | (B extends { readonly states: infer S }
      ? {
          [T in keyof S]: Exclude<
            KidsOpen<KidsOf<S[T]>>,
            ProvidedOf<B> | ProvidedOf<S[T]>
          >;
        }[keyof S]
      : never) extends infer O
  ? O
  : never;

// What the Actor's type keeps ------------------------------------------------------

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
export type SlotOf<C> = C extends {
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

/** The Queries of a level, as written: their answers by name. */
export type QueriesOf<L> = L extends { readonly queries: infer Q } ? Q : {};

/**
 * A Query as an Actor's type keeps it: what it is asked with and answers,
 * as `define` declares, and how it fails, as its answer does; not what its
 * `self` reads.
 */
export type AskOf<F, Q> = F extends (
  ...params: any
) => Effect.Effect<any, infer E, any>
  ? Q extends Declared
    ? {
        readonly args: Q['args'];
        readonly result: Q['result'];
        readonly error: E;
      }
    : never
  : never;

/** The Queries per State tag, top-level ones in every State, for code outside the tree. */
export type QueriesByState<State extends Tagged, B, Qs> = {
  readonly [T in State['_tag']]: {
    readonly [K in keyof (QueriesOf<B> & QueriesOf<BlockOf<B, T>>)]: AskOf<
      (QueriesOf<B> & QueriesOf<BlockOf<B, T>>)[K],
      K extends keyof Qs ? Qs[K] : never
    >;
  };
};

/** An Actor's Queries in one State, as written: by name. */
export type QueriesIn<A, T> = T extends keyof Types<A>['queries']
  ? Types<A>['queries'][T]
  : {};

/**
 * A Query as code outside the tree asks it: its args, if it declares any,
 * to an Effect with its answer, failing with its own failure or `Stopped`,
 * and needing nothing, since the Instance supplies its Capabilities. `S` is
 * the Runtime's `Stopped`.
 */
export type QueryAs<Q, S> = Q extends {
  readonly args: infer X;
  readonly result: infer Y;
  readonly error: infer E;
}
  ? [X] extends [void]
    ? () => Effect.Effect<Y, E | S>
    : (args: X) => Effect.Effect<Y, E | S>
  : never;
