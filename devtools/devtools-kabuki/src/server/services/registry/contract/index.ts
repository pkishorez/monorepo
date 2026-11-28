import { Context } from 'effect';
import type { Effect, Stream } from 'effect';
import type { TabClient } from '../../../rpc/contract/index.ts';

export class Registry extends Context.Service<Registry, RegistryCalls>()(
  'Inspector/server/Registry',
) {}

export interface Registered {
  readonly id: number;
  readonly name: string;
  readonly app: string;
  readonly environment: string;
  readonly url: string;
  readonly origin: string | null;
  readonly connectedAt: number;
  readonly client: TabClient;
}
export type Asked = Omit<Registered, 'id' | 'connectedAt'>;
export interface RegistryCalls {
  readonly add: (asked: Asked) => Effect.Effect<Registered>;
  readonly moved: (session: Registered, url: string) => Effect.Effect<void>;
  readonly remove: (session: Registered) => Effect.Effect<void>;
  readonly list: Effect.Effect<ReadonlyArray<Registered>>;
  readonly find: (name: string) => Effect.Effect<Registered | undefined>;
  readonly watch: Stream.Stream<ReadonlyArray<Registered>>;
  readonly gone: (session: Registered) => Effect.Effect<void>;
}
