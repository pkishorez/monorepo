import { Context, Stream } from 'effect';
import type { DecodedEntity } from '../entity-schema/index.js';

export type ChangeNotice<T = unknown> = DecodedEntity<T>;

export class Broadcaster extends Context.Service<
  Broadcaster,
  {
    broadcast: (values: DecodedEntity<any>[]) => void;
    changes: Stream.Stream<DecodedEntity<any>>;
  }
>()('Broadcaster') {}
