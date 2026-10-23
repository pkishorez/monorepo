export { Actor } from './actor.ts';
export { Command } from './command.ts';
export { RUN } from './types.ts';
export type { Defined } from './actor.ts';
export type {
  /** The Actor interface, by a name that does not clash with the `Actor` value: for code that builds Actors on top of `Actor.build`, and what a declaration file names an Actor by. */
  Actor as ActorType,
  /** A Command, as a declaration file names it. */
  Command as CommandType,
  ActorOf,
  AnyActor,
  Behavior,
  ChildAs,
  Data,
  ActorDefinition,
  Encoding,
  KidsByState,
  KidsIn,
  Only,
  OpenOfBehavior,
  ProvidedOf,
  QueriesByState,
  QueriesIn,
  QueryAs,
  QueryDefinition,
  Requires,
  Self,
  Single,
  SlotDefinition,
  Tagged,
  Types,
  WorkerDefinition,
} from './types.ts';
