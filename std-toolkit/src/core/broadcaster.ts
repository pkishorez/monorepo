import { Context } from 'effect';
import type { EntityType } from './schema.js';

export class Broadcaster extends Context.Service<
  Broadcaster,
  {
    broadcast: (values: EntityType<any>[]) => void;
  }
>()('Broadcaster') {}
