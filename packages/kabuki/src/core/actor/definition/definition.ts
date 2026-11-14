import type { Context, Schema } from 'effect';

/*
 * An Actor's Definition: its Shape and its Build together, as one plain
 * tree linked by its Children. `build` makes it, and a Runtime runs it.
 * Only kabuki's own code reads it, through `actor.definition`; every tool
 * outside reads the Actor's Blueprint. First, the words every Actor is
 * written in; last, the hidden key a Command keeps its Effect under, which
 * only the Runtime reads.
 */

/** A value told apart by its tag: every State, Message and Emit. */
export type Tagged = { readonly _tag: string };

/** The one State of an Actor declared without States. */
export type Single = { readonly _tag: 'Single' };

export type AnyKey = Context.Key<any, any>;
/** The Capabilities an Actor's own code may use. */
export type Requires = ReadonlyArray<AnyKey>;

export type IdsOf<R extends Requires> = R[number] extends infer K
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

/** One Query's Schemas, as `define` declares them; one without args has none. */
export interface QuerySchemas {
  readonly args?: Schema.Top;
  readonly result: Schema.Top;
}

/** Where a Command keeps the Effect it runs, out of sight of a comparison. */
export const RUN: unique symbol = Symbol.for('@kestack/kabuki/Command/run');

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
  /** By the tag of what the Child Emits, the parent's Message it becomes, given the Child's key. */
  readonly emits: Readonly<
    Record<string, ((event: Tagged, key: string) => Tagged) | undefined>
  >;
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

/** One Query, as the engine sees it: the State it is askable in, if not every one, what answers, and the checks of its args and answer. */
export interface QueryDefinition {
  /** The State whose block it is written in; none for a top-level Query. */
  readonly state?: string;
  readonly run: Function;
  /** Throw unless the args, or the answer, match what `define` declares. */
  readonly check: { readonly args: Check; readonly result: Check };
}

/** One level's Provides, as the engine sees it: the Capabilities it names, and the Layer that builds them. Only the ones named reach below. */
export interface ProvideDefinition {
  readonly capabilities: Requires;
  readonly layer: Function;
}

/** The Definition the engine works from; an Actor without States is keyed by its one State. */
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
    readonly emits: Check;
  };
  /** The Schemas it was defined with, as written; one it was not given is absent. */
  readonly schemas: {
    readonly input?: Schema.Top;
    readonly props?: Schema.Top;
    readonly model?: Schema.Top;
    readonly state?: Schema.Top;
    readonly message?: Schema.Top;
    readonly emits?: Schema.Top;
    /** Each Query's, by name. */
    readonly queries?: Readonly<Record<string, QuerySchemas>>;
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
  /** The top-level Provides, built once when the Instance starts. */
  readonly provides: ProvideDefinition | undefined;
  /** Each State's Provides, built each time it is entered. */
  readonly stateProvides: Readonly<
    Record<string, ProvideDefinition | undefined>
  >;
  /** The Children of each State: the top-level ones, then the State's own. */
  readonly children: Readonly<
    Record<string, Readonly<Record<string, SlotDefinition>> | undefined>
  >;
  /** The slots written at the top: they last as long as the Instance. */
  readonly lasting: ReadonlyArray<string>;
}
