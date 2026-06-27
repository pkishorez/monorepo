import { Context } from 'effect';
import type { EntityType } from './schema.js';

export class Broadcaster extends Context.Service<
  Broadcaster,
  {
    emit: (value: EntityType<any>[]) => void;
    broadcast: (value: EntityType<any>) => void;
    subscribe: (entity: string) => void;
    unsubscribe: (entity: string) => void;
  }
>()('Broadcaster') {}
