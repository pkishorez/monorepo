export { Actor } from './actor.ts';
export { Command } from './command.ts';
export { RUN } from './command.ts';
export type { Defined } from './actor.ts';
export type { Data, Only, Requires, Self, Single, Tagged } from './instance.ts';
export type {
  /** A Command, as a declaration file names it. */
  Command as CommandType,
} from './command.ts';
export type {
  ActorOf,
  Behavior,
  OpenOfBehavior,
  ProvidedOf,
} from './behavior.ts';
export type {
  ChildAs,
  KidsByState,
  KidsIn,
  QueriesByState,
  QueriesIn,
  QueryAs,
} from './kept.ts';
export type {
  /** The Actor interface, by a name that does not clash with the `Actor` value: for code that builds Actors on top of `Actor.build`, and what a declaration file names an Actor by. */
  Actor as ActorType,
  AnyActor,
  ActorDefinition,
  Encoding,
  QueryDefinition,
  SlotDefinition,
  Types,
  WorkerDefinition,
} from './definition.ts';
