import type {
  AnyNode,
  Behavior,
  ChildrenFor,
  ChildrenOf,
  Definition,
  IsSingle,
  Node as NodeOf,
  Open,
  ProvidesFor,
  Requires,
  Shape,
  Single,
  Tagged,
} from './types.ts';

/** A Node's definition, waiting for the behavior that runs it. */
export interface Defined<Behavior, N> {
  readonly build: (behavior: Behavior) => N;
}

function make<
  const Name extends string,
  State extends Tagged = Single,
  Model = {},
  Msg extends Tagged = never,
  R extends Requires = {},
  const Pv extends ProvidesFor<State> = never,
  C extends ChildrenFor<State> = {},
>(
  name: Name,
  shape: Shape<Model, State, Msg, R, Pv, C>,
): Defined<
  Behavior<Model, State, Msg, R, Pv>,
  NodeOf<
    Name,
    Model,
    State,
    Msg,
    ChildrenOf<State['_tag'], IsSingle<State> extends true ? { Single: C } : C>,
    Open<R>
  >
>;
function make(name: string, shape: any): Defined<any, AnyNode> {
  const keyed = (part: unknown) =>
    shape.state ? (part ?? {}) : part ? { Single: part } : {};
  return {
    build: (behavior) => ({
      name,
      definition: {
        name,
        requires: shape.requires ?? {},
        init: behavior.init ?? (() => ({})),
        update: keyed(behavior.update) as Definition['update'],
        lifetime: keyed(behavior.lifetime) as Definition['lifetime'],
        provides: keyed(behavior.provides) as Definition['provides'],
        children: keyed(shape.children) as Definition['children'],
      },
    }),
  };
}

/**
 * A Node, in two steps. `make` defines it: Requires, Schemas, what it Provides
 * and its Children, which fixes every type and the shape of the tree. `build`
 * makes it run: init, Update, Lifetimes and the Services it Provides.
 */
export const Node = { make };
