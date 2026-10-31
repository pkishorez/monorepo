import type { Data, Requires, Single, Tagged } from './instance.ts';
import type {
  AnyChild,
  Behavior,
  DeclaredQueries,
  MakeChild,
  OpenOfBehavior,
  Undeclared,
} from './behavior.ts';
import type { KidsByState, QueriesByState } from './kept.ts';
import type {
  Actor as ActorOf,
  AnyActor,
  Check,
  ActorDefinition,
  Encoding,
  QueryDefinition,
  QuerySchemas,
  SlotDefinition,
  WorkerDefinition,
} from './definition.ts';
import { Effect, Schema, SchemaAST } from 'effect';
import { structOf, taggedOf } from './schemas.ts';
import type {
  Codec,
  StructOf,
  StructWritten,
  TaggedOf,
  TaggedWritten,
} from './schemas.ts';

/**
 * What an Actor is, as `Actor.define` gives it: its name, and the Schemas
 * and Requires every type is fixed by. It runs nothing: its own `build`
 * adds how it behaves.
 */
export interface Defined<
  Name extends string,
  Input,
  Props,
  Model,
  State extends Tagged,
  Msg extends Tagged,
  R extends Requires,
  Emits extends Tagged = never,
  Qs extends DeclaredQueries = {},
> {
  readonly name: Name;
  readonly shape: Shape<Input, Props, Model, State, Msg, R, Emits>;
  /** Its Queries' types, as declared: read by the types alone, never there. */
  readonly '~queries'?: Qs;
}

/** What `Actor.define` gives: the definition, and its own `build`. */
export interface Buildable<
  Name extends string,
  Input,
  Props,
  Model,
  State extends Tagged,
  Msg extends Tagged,
  R extends Requires,
  Emits extends Tagged,
  Qs extends DeclaredQueries,
> {
  /**
   * How it behaves, at the top for as long as the Instance lives and under
   * `states` in one block per State for as long as that State lasts: its
   * Provides, its Children, each made with `Actor.child`, its Updates under
   * `on`, its Workers, and its answers to its Queries.
   */
  build<
    const B extends Behavior<Input, Props, Model, State, Msg, R, Emits, Qs>,
  >(
    behavior: B & Undeclared<B, Qs>,
  ): BuiltOf<Defined<Name, Input, Props, Model, State, Msg, R, Emits, Qs>, B>;
}

/** Any Actor's definition, loosely. */
export type AnyDefined = Defined<
  string,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any
>;

/**
 * An Actor's Schemas, each made from what `define` was written with. Every
 * value is checked against them as it is made: each Input and Props, each
 * Model and State from init or an Update, each Message as it is Sent, and
 * each thing it Emits. A saved History holds the encoded side of the Props,
 * Model, State and Message Schemas, so that side must be JSON-safe.
 */
export interface Shape<
  Input,
  Props,
  Model,
  State,
  Msg,
  R extends Requires,
  Emits = never,
> {
  /** The Capabilities its own Workers, Commands and Provides use. Nothing else is in reach. */
  readonly requires?: R;
  /** What a parent hands this Actor when it Invokes it, which init starts from. */
  readonly input?: Codec<Input>;
  /** What a parent hands this Actor for as long as it lives, worked out again after each of the parent's Updates. */
  readonly props?: Codec<Props>;
  readonly model?: Codec<Model>;
  readonly message?: Codec<Msg>;
  readonly state?: Codec<State>;
  /** What it tells its parent, which the parent's slot for it turns into the parent's own Messages. */
  readonly emits?: Codec<Emits>;
  /** The questions code outside the tree may ask it, by name: what each is asked with, and what it answers. */
  readonly queries?: Readonly<Record<string, QuerySchemas>>;
}

/**
 * What `define` takes: the Capabilities the Actor's own code may use, and
 * every type its behavior is checked against. Each is a Schema, or what it
 * is made of: a struct's fields, or a tagged union's cases by tag.
 */
export interface Written {
  readonly requires?: Requires;
  readonly input?: StructWritten;
  readonly props?: StructWritten;
  /** Always a struct: an Update gives only the fields that change. */
  readonly model?: StructWritten;
  readonly state?: TaggedWritten;
  readonly message?: TaggedWritten;
  readonly emits?: TaggedWritten;
  /** The questions code outside the tree may ask it, by name. */
  readonly queries?: { readonly [name: string]: QueryWritten };
}

/**
 * A Query as `define` takes it: what it is asked with, a struct's fields or
 * any Schema, none if it takes nothing; and the Schema of what it answers.
 */
export interface QueryWritten {
  readonly args?: StructWritten;
  readonly result: Schema.Top;
}

type Field<W, K extends string> = W extends { readonly [P in K]: infer X }
  ? X
  : undefined;

type InputOf<W> = [Field<W, 'input'>] extends [undefined]
  ? void
  : StructOf<Field<W, 'input'>>;
type PropsOf<W> = [Field<W, 'props'>] extends [undefined]
  ? void
  : StructOf<Field<W, 'props'>>;
type ModelOf<W> = [Field<W, 'model'>] extends [undefined]
  ? {}
  : StructOf<Field<W, 'model'>>;
type StateOf<W> = [Field<W, 'state'>] extends [undefined]
  ? Single
  : TaggedOf<Field<W, 'state'>>;
type TagsOf<W, K extends string> = [Field<W, K>] extends [undefined]
  ? never
  : TaggedOf<Field<W, K>>;
/** The Queries `W` declares: each one's args, `void` if it takes none, and its answer. */
export type DeclaredOf<W> = W extends { readonly queries: infer Q }
  ? {
      readonly [K in keyof Q]: {
        readonly args: Q[K] extends { readonly args: infer X }
          ? StructOf<X>
          : void;
        readonly result: Q[K] extends { readonly result: infer Y }
          ? Y extends Schema.Top
            ? Y['Type']
            : never
          : never;
      };
    }
  : {};
type RequiresOf<W> = W extends { readonly requires: infer R extends Requires }
  ? R
  : readonly [];

/** The Actor `define` gives for what it was written with, with its own `build`. */
export type DefinedOf<Name extends string, W> = Defined<
  Name,
  InputOf<W>,
  PropsOf<W>,
  ModelOf<W>,
  StateOf<W>,
  TagsOf<W, 'message'>,
  RequiresOf<W>,
  TagsOf<W, 'emits'>,
  DeclaredOf<W>
> &
  Buildable<
    Name,
    InputOf<W>,
    PropsOf<W>,
    ModelOf<W>,
    StateOf<W>,
    TagsOf<W, 'message'>,
    RequiresOf<W>,
    TagsOf<W, 'emits'>,
    DeclaredOf<W>
  >;

/** Refuses a Model that is not a struct, and a State, Message or Emit that is not tagged. */
export type Refused<W> = (ModelOf<W> extends ReadonlyArray<unknown>
  ? { readonly model: 'the Model must be a struct' }
  : ModelOf<W> extends object
    ? unknown
    : { readonly model: 'the Model must be a struct' }) &
  ([Field<W, 'state'>] extends [undefined]
    ? unknown
    : [StateOf<W>] extends [never]
      ? { readonly state: 'every State must be tagged' }
      : unknown);

/** The Schemas of what `define` was written with. */
export const shapeOf = (
  written: Written,
): Shape<unknown, unknown, unknown, Tagged, Tagged, Requires, Tagged> => {
  const shape = {
    requires: written.requires,
    input: structOf(written.input),
    props: structOf(written.props),
    model: structOf(written.model),
    state: taggedOf(written.state),
    message: taggedOf(written.message),
    emits: taggedOf(written.emits),
    queries:
      written.queries &&
      Object.fromEntries(
        Object.entries(written.queries).map(([name, { args, result }]) => [
          name,
          args === undefined ? { result } : { args: structOf(args)!, result },
        ]),
      ),
  };
  return Object.fromEntries(
    Object.entries(shape).filter(([, value]) => value !== undefined),
  );
};

function define<const Name extends string, const W extends Written = {}>(
  name: Name,
  written: W & Refused<W>,
): DefinedOf<Name, W> {
  const definition = {
    name,
    shape: shapeOf(written),
    build: (behavior: unknown) => build(definition, behavior),
  };
  return definition as unknown as DefinedOf<Name, W>;
}

/** How the Actor `D` defines may be built. */
export type BehaviorOf<D> =
  D extends Defined<
    any,
    infer Input,
    infer Props,
    infer Model,
    infer State,
    infer Msg,
    infer R,
    infer Emits,
    infer Qs
  >
    ? Behavior<Input, Props, Model, State, Msg, R, Emits, Qs>
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
    infer R,
    infer Emits,
    infer Qs
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
        { readonly [T in State['_tag']]: QueriesByState<State, B, Qs>[T] },
        Emits
      >
    : never;

/**
 * The Actor a definition builds: what `definition.build(behavior)` runs.
 * Code that builds from a definition it made itself, as the Router and pages
 * do, calls it directly.
 */
function build(
  definition: Pick<AnyDefined, 'name' | 'shape'>,
  behavior: any,
): AnyActor {
  return {
    name: definition.name,
    definition: definitionOf(definition.name, definition.shape, behavior),
  };
}

type Block = {
  readonly provides?: Function;
  readonly children?: Readonly<Record<string, AnyChild>>;
  readonly on?: Record<string, Function>;
  readonly workers?: Record<string, any>;
  readonly queries?: Record<string, Function>;
};

/** The plain definition the engine works from, out of the Schemas and the levels. */
const definitionOf = (
  name: string,
  shape: Shape<any, any, any, any, any, any, any>,
  behavior: Block & {
    readonly init?: ActorDefinition['init'];
    readonly states?: Record<string, Block | undefined>;
  },
): ActorDefinition => {
  if ('state' in behavior)
    throw new Error(
      `[@kestack/kabuki] ${name}: the blocks of its States are written under \`states\`, not \`state\``,
    );
  const blocks = behavior.states ?? {};
  const states = statesOf(shape.state, blocks);
  const top = slots(name, behavior.children);
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

  const declared = shape.queries ?? {};
  const queries: Record<string, QueryDefinition> = {};
  const addQueries = (from: Block, state: string | undefined) => {
    for (const [query, run] of Object.entries(from.queries ?? {})) {
      const schemas = declared[query];
      if (!schemas)
        throw new Error(
          `[@kestack/kabuki] ${name}: Query "${query}" is answered but not declared in \`define\``,
        );
      if (typeof run !== 'function')
        throw new Error(
          `[@kestack/kabuki] ${name}: Query "${query}" is answered by a function \`(self, args) => Effect\``,
        );
      if (queries[query])
        throw new Error(
          `[@kestack/kabuki] ${name}: Query "${query}" is written twice`,
        );
      const check = {
        args: checkerOf(name)(schemas.args),
        result: checkerOf(name)(schemas.result),
      };
      queries[query] =
        state === undefined ? { run, check } : { state, run, check };
    }
  };

  if (behavior.on) update['*'] = behavior.on as Record<string, Function>;
  addWorkers(behavior, undefined);
  addQueries(behavior, undefined);
  for (const tag of states) {
    const block = blocks[tag] ?? {};
    const own = slots(name, block.children);
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
  for (const query of Object.keys(declared))
    if (!queries[query])
      Effect.runSync(
        Effect.logWarning(
          `[@kestack/kabuki] ${name}: Query "${query}" is declared but answered nowhere, so asking it always fails`,
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
      emits: checkerOf(name)(shape.emits),
    },
    schemas: Object.fromEntries(
      (
        [
          'input',
          'props',
          'model',
          'state',
          'message',
          'emits',
          'queries',
        ] as const
      ).flatMap((what) => (shape[what] ? [[what, shape[what]]] : [])),
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

/** One Child, as `Actor.child` makes it: its Actor and its options, as written. */
const child = ((actor: AnyActor, options: object = {}): AnyChild => {
  if (!actor || typeof actor !== 'object' || !('definition' in actor))
    throw new Error(
      '[@kestack/kabuki] `Actor.child` takes a built Actor first, then its options',
    );
  return { ...options, actor };
}) as MakeChild;

/** The Children a level names, as the engine reads them. */
const slots = (
  name: string,
  children: Block['children'],
): Record<string, SlotDefinition> => {
  if (typeof children === 'function')
    throw new Error(
      `[@kestack/kabuki] ${name}: \`children\` is an object of Children, each made with \`Actor.child\`, not a function`,
    );
  return Object.fromEntries(
    Object.entries(children ?? {}).map(([slot, made]) => [slot, slotOf(made)]),
  );
};

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
    emits: (child.emits ?? {}) as SlotDefinition['emits'],
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
 * Requires, which fix every type, what it Emits to its parent, and the
 * Queries code outside the tree may ask it, each with what it is asked with
 * and what it answers. The definition's own `build` takes how it behaves.
 * `child` makes each Child a level names, typed by the level it is in.
 */
export const Actor = { define, child };
