import type {
  Actor as ActorOf,
  AnyActor,
  AnyChild,
  Behavior,
  Check,
  Data,
  ActorDefinition,
  Encoding,
  KidsByState,
  OpenOfBehavior,
  QueriesByState,
  QueryDefinition,
  Requires,
  Single,
  SlotDefinition,
  Tagged,
  WorkerDefinition,
} from './types.ts';
import { Effect, Schema, SchemaAST } from 'effect';

/**
 * What an Actor is, as `Actor.define` gives it: its name, and the Schemas
 * and Requires every type is fixed by. It runs nothing: `Actor.build` adds
 * how it behaves.
 */
export interface Defined<
  Name extends string,
  Input,
  Props,
  Model,
  State extends Tagged,
  Msg extends Tagged,
  R extends Requires,
> {
  readonly name: Name;
  readonly shape: Shape<Input, Props, Model, State, Msg, R>;
}

/** Any Actor's definition, loosely. */
export type AnyDefined = Defined<string, any, any, any, any, any, any>;

/** A Schema Kabuki can read and write without Capabilities and at once. */
type Codec<T> = Schema.Codec<T, unknown, never, never>;

/**
 * What `define` takes: every type the behavior is checked against, as codecs,
 * and the Capabilities the Actor's own code may use. Every value is checked
 * against them too, as it is made: each Input and Props, each Model and
 * State from init or an Update, and each Message as it is Sent. A saved
 * History holds the encoded side of the Props, Model, State and Message
 * Schemas, so that side must be JSON-safe.
 */
export interface Shape<Input, Props, Model, State, Msg, R extends Requires> {
  /** The Capabilities its own Workers, Commands and Provides use. Nothing else is in reach. */
  readonly requires?: R;
  /** What a parent hands this Actor when it Invokes it, which init starts from. */
  readonly input?: Codec<Input>;
  /** What a parent hands this Actor for as long as it lives, worked out again after each of the parent's Updates. */
  readonly props?: Codec<Props>;
  readonly model?: Codec<Model>;
  readonly message?: Codec<Msg>;
  readonly state?: Codec<State>;
}

function define<
  const Name extends string,
  State extends Tagged = Single,
  Model = {},
  Msg extends Tagged = never,
  const R extends Requires = readonly [],
  Input = void,
  Props = void,
>(
  name: Name,
  shape: Shape<Input, Props, Model, State, Msg, R>,
): Defined<Name, Input, Props, Model, State, Msg, R> {
  return { name, shape };
}

/** How the Actor `D` defines may be built, as written in `B`. */
export type BehaviorOf<D, B> =
  D extends Defined<
    any,
    infer Input,
    infer Props,
    infer Model,
    infer State,
    infer Msg,
    infer R
  >
    ? Behavior<Input, Props, Model, State, Msg, R, B>
    : never;

/** The Actor `D` defines, built with `B`. */
export type BuiltOf<D, B> =
  D extends Defined<
    infer Name,
    infer Input,
    infer Props,
    infer Model,
    infer State,
    infer Msg,
    infer R
  >
    ? ActorOf<
        Name,
        Input,
        Props,
        Model,
        State,
        Msg,
        // Mapped here, not named, so the Actor's type prints each as its plain
        // shape, never as an alias of `B`.
        { readonly [T in State['_tag']]: KidsByState<State, B>[T] },
        OpenOfBehavior<R, B>,
        { readonly [T in State['_tag']]: QueriesByState<State, B>[T] }
      >
    : never;

function build<D extends AnyDefined, const B extends BehaviorOf<D, B>>(
  definition: D,
  behavior: B,
): BuiltOf<D, B>;
function build(definition: AnyDefined, behavior: any): AnyActor {
  return {
    name: definition.name,
    definition: definitionOf(definition.name, definition.shape, behavior),
  };
}

type Block = {
  readonly provides?: Function;
  readonly children?: Record<string, AnyChild>;
  readonly on?: Record<string, Function>;
  readonly workers?: Record<string, any>;
  readonly queries?: Record<string, QueryDefinition>;
};

/** The plain definition the engine works from, out of the Schemas and the levels. */
const definitionOf = (
  name: string,
  shape: Shape<any, any, any, any, any, any>,
  behavior: Block & {
    readonly init?: ActorDefinition['init'];
    readonly state?: Record<string, Block | undefined>;
  },
): ActorDefinition => {
  const blocks = behavior.state ?? {};
  const states = statesOf(shape.state, blocks);
  const top = slots(behavior.children);
  const lasting = Object.keys(top);

  const children: Record<string, Record<string, SlotDefinition>> = {};
  const update: Record<string, Record<string, Function>> = {};
  const stateProvides: Record<string, Function | undefined> = {};
  const workers: Record<string, WorkerDefinition> = {};
  const addWorkers = (from: Block, state: string | undefined) => {
    for (const [worker, written] of Object.entries(from.workers ?? {})) {
      if (workers[worker])
        throw new Error(
          `[@kestack/kabuki] ${name}: Worker "${worker}" is written twice`,
        );
      workers[worker] = workerOf(written, state);
    }
  };

  const queries: Record<string, QueryDefinition> = {};
  const addQueries = (from: Block, state: string | undefined) => {
    for (const [query, { run }] of Object.entries(from.queries ?? {})) {
      if (queries[query])
        throw new Error(
          `[@kestack/kabuki] ${name}: Query "${query}" is written twice`,
        );
      queries[query] = state === undefined ? { run } : { state, run };
    }
  };

  if (behavior.on) update['*'] = behavior.on as Record<string, Function>;
  addWorkers(behavior, undefined);
  addQueries(behavior, undefined);
  for (const tag of states) {
    const block = blocks[tag] ?? {};
    const own = slots(block.children);
    for (const slot of Object.keys(own))
      if (slot in top)
        throw new Error(
          `[@kestack/kabuki] ${name}: Child "${slot}" is written at the top and in ${tag}`,
        );
    children[tag] = { ...top, ...own };
    if (block.on) update[tag] = block.on as Record<string, Function>;
    stateProvides[tag] = block.provides;
    addWorkers(block, tag);
    addQueries(block, tag);
  }
  // TypeScript cannot see this: a rule that destructures its Message hides
  // its whole `on` from inference. So it is checked once here, and warned.
  for (const tag of tagsOf(shape.message))
    if (!Object.values(update).some((rules) => tag in rules))
      Effect.runSync(
        Effect.logWarning(
          `[@kestack/kabuki] ${name}: Message "${tag}" has no rule at the top or in any State, so it is always ignored`,
        ),
      );

  return {
    name,
    states,
    requires: shape.requires ?? [],
    check: {
      input: checkerOf(name)(shape.input),
      props: checkerOf(name)(shape.props),
      model: checkerOf(name)(shape.model),
      state: checkerOf(name)(shape.state),
      message: checkerOf(name)(shape.message),
    },
    schemas: Object.fromEntries(
      (['input', 'props', 'model', 'state', 'message'] as const).flatMap(
        (what) => (shape[what] ? [[what, shape[what]]] : []),
      ),
    ),
    encoding: {
      props: encodingOf(shape.props),
      model: encodingOf(shape.model),
      state: encodingOf(shape.state),
      message: encodingOf(shape.message),
    },
    init: behavior.init ?? (() => ({})),
    update,
    workers,
    queries,
    provides: behavior.provides,
    stateProvides,
    children,
    lasting,
  };
};

const slots = (
  children: Record<string, AnyChild> | undefined,
): Record<string, SlotDefinition> =>
  Object.fromEntries(
    Object.entries(children ?? {}).map(([slot, child]) => [
      slot,
      slotOf(child),
    ]),
  );

const ONE: ReadonlyArray<string> = [''];
const NONE: ReadonlyArray<string> = [];
const NOTHING = () => undefined;

/**
 * A Child as the keys its Condition names, the way a Worker is: one, `''`,
 * for every kind but `each`, or its `key` if it names one.
 */
const slotOf = (child: AnyChild): SlotDefinition => {
  const exists = child.while;
  const key = child.key as ((data: unknown) => string) | undefined;
  const one: SlotDefinition['keys'] = key ? (data) => [key(data)] : () => ONE;
  return {
    definition: child.actor.definition,
    kind: child.each ? 'each' : exists ? 'while' : 'always',
    keyed: key !== undefined,
    keys: child.each
      ? (child.each as SlotDefinition['keys'])
      : exists
        ? (data) => (exists(data) ? one(data) : NONE)
        : one,
    input: (child.input ?? NOTHING) as SlotDefinition['input'],
    props: (child.props ?? NOTHING) as SlotDefinition['props'],
  };
};

/**
 * The State tags: a tagged union's cases, else every State a block is
 * written for. An Actor without States has the one, `Single`.
 */
const statesOf = (
  schema: unknown,
  blocks: Record<string, unknown>,
): ReadonlyArray<string> => {
  if (!schema) return ['Single'];
  const cases = (schema as { readonly cases?: Record<string, unknown> }).cases;
  return Object.keys(cases ?? blocks);
};

/** Throws, naming the Actor and what the value is, unless `schema` describes it. */
const checkerOf =
  (name: string) =>
  (schema: Schema.Top | undefined): Check => {
    if (!schema) return () => {};
    const decode = Schema.decodeUnknownSync(Schema.toType(schema));
    return (value, what) => {
      try {
        decode(value);
      } catch (error) {
        throw new TypeError(
          `[@kestack/kabuki] ${name}: ${what} does not match its Schema\n${(error as Error).message}`,
        );
      }
    };
  };

const AS_IS: Encoding = { encode: (value) => value, decode: (value) => value };

/** A value to its Schema's encoded side and back, for a saved History. */
const encodingOf = (schema: Codec<unknown> | undefined): Encoding =>
  schema
    ? {
        encode: Schema.encodeUnknownSync(schema),
        decode: Schema.decodeUnknownSync(schema),
      }
    : AS_IS;

/** The tags a Message Schema names: one per tagged struct in its union. */
const tagsOf = (schema: Schema.Top | undefined): ReadonlyArray<string> => {
  if (!schema) return [];
  const { ast } = schema;
  return (SchemaAST.isUnion(ast) ? ast.types : [ast]).flatMap((member) =>
    SchemaAST.isObjects(member)
      ? member.propertySignatures.flatMap(({ name, type }) =>
          name === '_tag' && SchemaAST.isLiteral(type)
            ? [String(type.literal)]
            : [],
        )
      : [],
  );
};

/**
 * A Worker's Condition as the keys it names: one, `''`, for every kind but
 * `each`. Written in a State's block, it names none outside that State.
 */
const workerOf = (worker: any, state: string | undefined): WorkerDefinition => {
  const { run } = worker;
  const own: (data: Data<unknown, Tagged, unknown>) => ReadonlyArray<string> =
    'each' in worker
      ? worker.each
      : 'while' in worker
        ? (data) => (worker.while(data) ? ONE : NONE)
        : () => ONE;
  const kind =
    'each' in worker
      ? 'each'
      : 'while' in worker
        ? 'while'
        : state === undefined
          ? 'instance'
          : 'state';
  if (state === undefined) return { kind, keys: own, run };
  return {
    kind,
    state,
    keys: (data) => (data.state._tag === state ? own(data) : NONE),
    run,
  };
};

/**
 * An Actor, in two steps. `define` takes what it is: its Schemas and
 * Requires, which fix every type. `build` takes a definition and how it
 * behaves, at the top for as long as the Instance lives and in one block per
 * State for as long as that State lasts: its Provides, Children, Updates
 * under `on`, Workers, and the Queries it answers from outside.
 */
export const Actor = { define, build };
