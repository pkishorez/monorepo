import type {
  Actor as ActorOf,
  AnyActor,
  Behavior,
  ByState,
  ChildrenFor,
  Definition,
  Many,
  Open,
  ProvidesFor,
  Requires,
  Shape,
  Single,
  Slot,
  Tagged,
} from './types.ts';

/** An Actor's definition, waiting for the behavior that runs it. */
export interface Defined<Behavior, A> {
  readonly build: (behavior: Behavior) => A;
}

function make<
  const Name extends string,
  State extends Tagged = Single,
  Model = {},
  Msg extends Tagged = never,
  R extends Requires = {},
  const Pv extends ProvidesFor<State> = never,
  C extends ChildrenFor<State> = {},
  Input = void,
>(
  name: Name,
  shape: Shape<Input, Model, State, Msg, R, Pv, C>,
): Defined<
  Behavior<Input, Model, State, Msg, R, Pv, C>,
  ActorOf<Name, Input, Model, State, Msg, ByState<State, C>, Open<R>>
>;
function make(name: string, shape: any): Defined<any, AnyActor> {
  const keyed = (part: unknown) =>
    shape.state ? (part ?? {}) : part ? { Single: part } : {};
  const slots = (children: Record<string, Slot> | undefined) =>
    Object.fromEntries(
      Object.entries(children ?? {}).map(([slot, child]) => [
        slot,
        isMany(child)
          ? { definition: child.actor.definition, many: true }
          : { definition: child.definition, many: false },
      ]),
    );
  const children = Object.fromEntries(
    Object.entries(keyed(shape.children)).map(([tag, kids]) => [
      tag,
      slots(kids as Record<string, Slot>),
    ]),
  );
  return {
    build: (behavior) => ({
      name,
      definition: {
        name,
        requires: shape.requires ?? {},
        init: behavior.init ?? (() => ({})),
        update: keyed(behavior.update) as Definition['update'],
        lifetime: (shape.state
          ? (behavior.lifetime ?? {})
          : behavior.lifetime
            ? { '*': behavior.lifetime }
            : {}) as Definition['lifetime'],
        provides: keyed(behavior.provides) as Definition['provides'],
        children,
        invoke: keyed(behavior.invoke) as Definition['invoke'],
      },
    }),
  };
}

const isMany = (slot: Slot): slot is Many<AnyActor> =>
  '_tag' in slot && slot._tag === 'Many';

/** A keyed Child slot: the parent Invokes one Instance of `actor` per key. */
const many = <A extends AnyActor>(actor: A): Many<A> => ({
  _tag: 'Many',
  actor,
});

/**
 * An Actor, in two steps. `make` defines it: Requires, Input, Schemas, what it
 * Provides and its Children, which fixes every type and the shape of the tree.
 * `build` makes it run: init, Update, Lifetimes, Provides and what it Invokes.
 */
export const Actor = { make, many };
