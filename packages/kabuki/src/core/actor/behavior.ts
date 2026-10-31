import type { Effect, Layer, Scope } from 'effect';
import type { Command } from './command.ts';
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
 * When a Child exists, written as a Worker's Condition is: always, `while` a
 * test is true, or once per key `each` names. Where it is written is part of
 * it too: at the top for as long as the Instance lives, in a State's block
 * while that State lasts. A Child that is one, always or `while`, may name a
 * `key`: when it changes, the Child is Invoked again, a fresh Instance.
 */
export type Condition<Model, State, Props> =
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
export type Loose<Model, State, Props> = {
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
export type KidsOf<L> = L extends { readonly children: infer C } ? C : {};

/**
 * One level of an Actor's behavior: the top, for as long as the Instance
 * lives, or one State's block, for as long as that State lasts. `L` is the
 * level as written, so each Child is checked against the Actor written in it.
 */
export type Level<
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

export type ModelInit<Model> = {} extends Model
  ? { readonly model?: Model }
  : { readonly model: Model };

/** The block written for State `T`, if any. */
export type BlockOf<B, T extends PropertyKey> = B extends {
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

export type OpenOf<A> =
  A extends Actor<any, any, any, any, any, any, any, infer O, any> ? O : never;

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
