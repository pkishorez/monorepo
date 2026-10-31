import type { Effect, Layer, Scope } from 'effect';
import type { Command } from '../command/index.ts';
import type { Actor, AnyActor, Types } from './definition.ts';
import type {
  Data,
  IdsOf,
  Only,
  Requires,
  Self,
  Single,
  Tagged,
} from './instance.ts';

/*
 * How an Actor is written in `Actor.build`: its Updates, Workers, Queries
 * and Children, level by level, and what its needs bubble up as.
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
 * What a parent hands one Child, worked out from its data and the Child's
 * key, `''` unless it is one of `each`: its Input, read once, and its Props,
 * read live. Each is required once the Child declares it.
 */
export type Given<A, Model, State, Props> = ([Types<A>['input']] extends [void]
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

/** What `child` takes besides the Actor, but when it exists: what it is handed, and what the parent hears from it. */
export type ChildOptions<A, Model, State, Props, Msg> = Given<
  A,
  Model,
  State,
  Props
> &
  Hears<A, Msg>;

declare const made: unique symbol;

/** Anything `child` made: a level's Children are made with it, never written by hand. */
export interface Made {
  readonly actor: AnyActor;
  readonly [made]: true;
}

/** A Child as `child` makes it, as its parent's type keeps it: its Actor, and whether it is one of `each` or there `while` a test holds. */
export type Slot<A, Kind extends 'always' | 'while' | 'each' = 'always'> = {
  readonly actor: A;
  readonly [made]: true;
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
 * from the parent's data at this level, its State narrowed in a State's
 * block, and checked against the Actor: its Input, its Props, and what it
 * Emits, each turned into one of the parent's Messages.
 *
 * - Always, with neither `while` nor `each`: one Instance, for as long as
 *   its level lasts.
 * - `while` a test is true: one Instance or none.
 * - `each` key a function names: one Instance per key, in their order.
 *
 * One that is always or `while` may name a `key`: when it changes, the
 * Child is Invoked again, a fresh Instance.
 */
export interface ChildOf<Model, State, Props, Msg> {
  <A extends AnyActor>(
    actor: A,
    options: ChildOptions<A, Model, State, Props, Msg> & {
      readonly each: (data: Data<Model, State, Props>) => ReadonlyArray<string>;
      readonly while?: never;
      readonly key?: never;
    },
  ): Slot<A, 'each'>;
  <A extends AnyActor>(
    actor: A,
    options: ChildOptions<A, Model, State, Props, Msg> & {
      readonly while: (data: Data<Model, State, Props>) => boolean;
      readonly each?: never;
      readonly key?: (data: Data<Model, State, Props>) => string;
    },
  ): Slot<A, 'while'>;
  <A extends AnyActor>(
    actor: A,
    ...options: Bare<A> extends true
      ? [options?: Always<A, Model, State, Props, Msg>]
      : [options: Always<A, Model, State, Props, Msg>]
  ): Slot<A>;
}

/** The options of a Child that is always there. */
type Always<A, Model, State, Props, Msg> = ChildOptions<
  A,
  Model,
  State,
  Props,
  Msg
> & {
  readonly while?: never;
  readonly each?: never;
  readonly key?: (data: Data<Model, State, Props>) => string;
};

/** A Child as `child` makes it, loosely: what the engine and Views read it as. */
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

/** The Children of a level, as its `children` makes them. */
export type KidsOf<L> = L extends {
  readonly children: (...args: any) => infer C;
}
  ? C
  : {};

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
> = {
  /** The Capabilities this level gives everything below it, as one Layer. */
  readonly provides?: (
    self: Self<Model, State, Msg, Props>,
  ) => Layer.Layer<any, never, IdsOf<R>>;
  /** The Children of this level, each made with `child`, by name. */
  readonly children?: (
    child: ChildOf<Model, State, Props, Msg>,
  ) => Readonly<Record<string, Made>>;
  /** The Updates: per Message, the Model's changes, the next State, the Commands and what to Emit. */
  readonly on?: Rules<Model, State, Props, Msg, R, Next, Emits>;
  readonly workers?: Workers<Model, State, Msg, R, Props>;
  /** The questions this level answers from outside the tree, by name. */
  readonly queries?: Queries<Model, State, R, Props>;
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
> =
  IsSingle<State> extends true
    ? Level<Model, Single, Props, Msg, R, never, Emits> & {
        readonly states?: never;
      } & ([Input] extends [void]
          ? {} extends Model
            ? { readonly init?: (input: Input) => ModelInit<Model> }
            : { readonly init: (input: Input) => ModelInit<Model> }
          : { readonly init: (input: Input) => ModelInit<Model> })
    : Level<Model, State, Props, Msg, R, State, Emits> & {
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
            Emits
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
