import { Context, Data, type Effect, type Layer } from 'effect';
import type { StdTableService } from '@kestack/std-toolkit/db';

export class StoreFailed extends Data.TaggedError('StoreFailed')<{
  readonly message: string;
}> {}

export class ConnectionOwnedByAnother extends Data.TaggedError(
  'ConnectionOwnedByAnother',
)<{ readonly owner: string; readonly user: string }> {
  override get message() {
    return `This Connection is ${this.owner}'s, not ${this.user}'s. Run \`ke-connect remove <name>\` first, or serve another name.`;
  }
}

export class ConnectionOfAnotherCloud extends Data.TaggedError(
  'ConnectionOfAnotherCloud',
)<{ readonly cloud: string; readonly asked: string }> {
  override get message() {
    return `This Connection is one of ${this.cloud}, not ${this.asked}. Serve it with --cloud ${this.cloud}, or serve another name.`;
  }
}

export class Store extends Context.Service<
  Store,
  {
    readonly connection: Effect.Effect<KeptConnection | null, StoreFailed>;
    readonly claim: (options: {
      readonly owner: Owner;
      readonly cloud: string;
      readonly name: string;
      readonly startedAt: number;
    }) => Effect.Effect<
      { readonly id: string; readonly name: string },
      StoreFailed | ConnectionOwnedByAnother | ConnectionOfAnotherCloud
    >;
    readonly forget: Effect.Effect<void, StoreFailed>;
    readonly authWorker: (
      cloud: string,
    ) => Effect.Effect<AuthWorker | null, StoreFailed>;
    readonly keepAuthWorker: (
      worker: AuthWorker,
    ) => Effect.Effect<void, StoreFailed>;
    readonly signInTable: SignInTable;
  }
>()('Connect/service/Store') {}

export interface Owner {
  readonly id: string;
  readonly email: string;
}
export interface KeptConnection {
  readonly id: string;
  readonly name: string;
  readonly owner: Owner;
  readonly cloud: string;
  readonly startedAt: number;
}
export interface AuthWorker {
  readonly cloud: string;
  readonly url: string;
}
export type SignInTable = Layer.Layer<StdTableService<'auth-device-accounts'>>;

export type StoreLayer = Layer.Layer<Store, StoreFailed>;
