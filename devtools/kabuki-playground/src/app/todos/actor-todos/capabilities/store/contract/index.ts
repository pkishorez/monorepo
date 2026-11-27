import { Context } from 'effect';
import type { Effect } from 'effect';
import type { ServerDown } from '../../../../../../services/server/contract/index.ts';

export interface StoreService {
  readonly save: (id: string, title: string) => Effect.Effect<void, ServerDown>;
}

export class Store extends Context.Service<Store, StoreService>()(
  'Todos/capability/Store',
) {}
