import { Context } from 'effect';
import type { Effect, Scope, Stream } from 'effect';
import type { RpcClientError } from 'effect/rpc';
import type { KabukiSessionClient } from '@kestack/devtools-kabuki/api';
import type { KabukiSessionSummary } from '@kestack/devtools-kabuki/server';

export interface SessionsService {
  readonly watch: Stream.Stream<
    ReadonlyArray<KabukiSessionSummary>,
    RpcClientError.RpcClientError
  >;
  readonly dial: (
    name: string,
  ) => Effect.Effect<KabukiSessionClient, never, Scope.Scope>;
}

export class Sessions extends Context.Service<Sessions, SessionsService>()(
  'Kabuki/service/Sessions',
) {}
