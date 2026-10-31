import { Actor } from '../actor/index.ts';

/*
 * `Actor`: what an Actor is, `define`, and how it behaves, `build`; and the
 * types code on top of them names an Actor and its parts by.
 */

/** What an Actor is: its name, and the Schemas and Requires every type is fixed by. It runs nothing. */
export const define = Actor.define;
/** How the Actor `define` gave behaves: its init, Updates, Workers, Queries, Children and Provides. */
export const build = Actor.build;

export type {
  /** An Actor, as `build` gives it. */
  ActorType as Actor,
  /** Any Actor. */
  AnyActor as Any,
  /** The plain definition the engine works from. */
  ActorDefinition as Definition,
  /** A Child as written: the Actor in it. */
  ActorOf as Of,
  Behavior,
  BehaviorOf,
  BuiltOf,
  ChildAs,
  Data,
  Defined,
  KidsByState,
  KidsIn,
  Only,
  OpenOfBehavior,
  ProvidedOf,
  QueriesByState,
  QueriesIn,
  QueryAs,
  Requires,
  Self,
  Single,
  Tagged,
  Types,
} from '../actor/index.ts';
