import type {
  Actor as ActorOf,
  AnyActor,
  Behavior,
  Check,
  Data,
  ActorDefinition,
  KidsByState,
  Many,
  OpenOfBehavior,
  Requires,
  Single,
  Slot,
  SlotDefinition,
  Tagged,
  WorkerDefinition,
} from './types.ts';
import { Effect, Schema, SchemaAST } from 'effect';

/** An Actor's Schemas, waiting for the behavior that runs it. */
export interface Defined<
  Name extends string,
  Input,
  Props,
  Model,
  State extends Tagged,
  Msg extends Tagged,
  R extends Requires,
> {
  readonly build: <
    const B extends Behavior<Input, Props, Model, State, Msg, R, B>,
  >(
    behavior: B,
  ) => ActorOf<
    Name,
    Input,
    Props,
    Model,
    State,
    Msg,
    KidsByState<State, B>,
    OpenOfBehavior<R, B>
  >;
}

/** A Schema Effect Oak can read and write without Capabilities and at once. */
type Codec<T> = Schema.Codec<T, unknown, never, never>;

/**
 * What `make` takes: every type the behavior is checked against, as codecs,
 * and the Capabilities the Actor's own code may use. Every value is checked
 * against them too, as it is made: each Input and Props, each Model and
 * State from init or an Update, and each Message as it is Sent.
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

function make<
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
): Defined<Name, Input, Props, Model, State, Msg, R>;
function make(name: string, shape: Shape<any, any, any, any, any, any>) {
  return {
    build: (behavior: any): AnyActor => ({
      name,
      definition: definitionOf(name, shape, behavior),
    }),
  };
}

type Block = {
  readonly provides?: Function;
  readonly children?: Record<string, Slot>;
  readonly invoke?: Function;
  readonly on?: Record<string, Function>;
  readonly workers?: Record<string, any>;
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
  const invoke: Record<string, Function | undefined> = {};
  const update: Record<string, Record<string, Function>> = {};
  const stateProvides: Record<string, Function | undefined> = {};
  const workers: Record<string, WorkerDefinition> = {};
  const addWorkers = (from: Block, state: string | undefined) => {
    for (const [worker, written] of Object.entries(from.workers ?? {})) {
      if (workers[worker])
        throw new Error(
          `[effect-oak] ${name}: Worker "${worker}" is written twice`,
        );
      workers[worker] = workerOf(written, state);
    }
  };

  if (behavior.on) update['*'] = behavior.on as Record<string, Function>;
  addWorkers(behavior, undefined);
  for (const tag of states) {
    const block = blocks[tag] ?? {};
    const own = slots(block.children);
    for (const slot of Object.keys(own))
      if (slot in top)
        throw new Error(
          `[effect-oak] ${name}: Child "${slot}" is written at the top and in ${tag}`,
        );
    children[tag] = { ...top, ...own };
    invoke[tag] = merged(behavior.invoke, block.invoke);
    if (block.on) update[tag] = block.on as Record<string, Function>;
    stateProvides[tag] = block.provides;
    addWorkers(block, tag);
  }
  // TypeScript cannot see this: a rule that destructures its Message hides
  // its whole `on` from inference. So it is checked once here, and warned.
  for (const tag of tagsOf(shape.message))
    if (!Object.values(update).some((rules) => tag in rules))
      Effect.runSync(
        Effect.logWarning(
          `[effect-oak] ${name}: Message "${tag}" has no rule at the top or in any State, so it is always ignored`,
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
    init: behavior.init ?? (() => ({})),
    update,
    workers,
    provides: behavior.provides,
    stateProvides,
    children,
    lasting,
    invoke,
  };
};

const slots = (
  children: Record<string, Slot> | undefined,
): Record<string, SlotDefinition> =>
  Object.fromEntries(
    Object.entries(children ?? {}).map(([slot, child]) => [
      slot,
      isMany(child)
        ? { definition: child.actor.definition, many: true }
        : { definition: child.definition, many: false },
    ]),
  );

/** The top-level Invocation and a State's own, as one. */
const merged = (
  top: Function | undefined,
  own: Function | undefined,
): Function | undefined =>
  !top ? own : !own ? top : (data: unknown) => ({ ...top(data), ...own(data) });

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
          `[effect-oak] ${name}: ${what} does not match its Schema\n${(error as Error).message}`,
        );
      }
    };
  };

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

const ONE: ReadonlyArray<string> = [''];
const NONE: ReadonlyArray<string> = [];

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

const isMany = (slot: Slot): slot is Many<AnyActor> =>
  '_tag' in slot && slot._tag === 'Many';

/** A keyed Child slot: the parent Invokes one Instance of `actor` per key. */
const many = <A extends AnyActor>(actor: A): Many<A> => ({
  _tag: 'Many',
  actor,
});

/**
 * An Actor, in two steps. `make` takes its Schemas and Requires, which fixes
 * every type. `build` takes how it behaves, at the top for as long as the
 * Instance lives and in one block per State for as long as that State lasts:
 * its Provides, Children, Invocation, Updates under `on`, and Workers.
 */
export const Actor = { make, many };
