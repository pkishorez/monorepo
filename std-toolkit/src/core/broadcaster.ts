import { Context } from 'effect';
import type { DecodedEntity } from './entity-schema/index.js';

export class Broadcaster extends Context.Service<
  Broadcaster,
  {
    broadcast: (values: DecodedEntity<any>[]) => void;
  }
>()('Broadcaster') {}
