import type { Schema } from 'effect';
import type { Data, Requires, Tagged } from './instance.ts';

/*
 * An Actor as the engine reads it, its plain definition, and as its type
 * carries it: its name, its definition, and what its types say.
 */

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
  /** The Schemas it was defined with, as written, for a tool that describes it; one it was not given is absent. */
  readonly schemas: {
    readonly input?: Schema.Top;
    readonly props?: Schema.Top;
    readonly model?: Schema.Top;
    readonly state?: Schema.Top;
    readonly message?: Schema.Top;
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
