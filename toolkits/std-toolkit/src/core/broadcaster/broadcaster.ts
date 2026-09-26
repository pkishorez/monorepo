import { Context, Stream } from 'effect';
import type { Entity } from '../entity-schema/index.js';

export type ChangeNotice<T = unknown> = Entity<T>;

export class Broadcaster extends Context.Service<
  Broadcaster,
  {
    broadcast: (values: Entity<any>[]) => void;
    changes: Stream.Stream<Entity<any>>;
  }
>()('Broadcaster') {}
