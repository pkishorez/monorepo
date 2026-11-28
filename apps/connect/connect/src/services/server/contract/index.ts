import { Context, Data, type Effect, type Scope } from 'effect';

export class PortFailed extends Data.TaggedError('PortFailed')<{
  readonly message: string;
}> {}

export class Server extends Context.Service<
  Server,
  {
    readonly listen: (
      options: ServerOptions,
    ) => Effect.Effect<number, PortFailed, Scope.Scope>;
  }
>()('Connect/service/Server') {}

export type Route =
  | { readonly socket: string }
  | { readonly running: string | null };
export interface ServerOptions {
  readonly port: number;
  readonly origins: ReadonlyArray<string>;
  readonly key: () => string;
  readonly route: (name: string, hash: string) => Route | null;
}
