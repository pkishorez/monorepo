import { Context, Data, type Effect, type Scope } from 'effect';

export interface OpenTunnel {
  readonly url: string;
  readonly closed: Effect.Effect<void>;
}

export class TunnelFailed extends Data.TaggedError('TunnelFailed')<{
  readonly message: string;
}> {}

export class Cloudflared extends Context.Service<
  Cloudflared,
  {
    readonly open: (
      port: number,
    ) => Effect.Effect<OpenTunnel, TunnelFailed, Scope.Scope>;
    readonly reachable: (url: string) => Effect.Effect<boolean>;
  }
>()('Connect/service/Cloudflared') {}
