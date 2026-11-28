import { Context } from 'effect';
import type { Layer, Stream } from 'effect';
import type { RpcClientError } from 'effect/rpc';
import type {
  KabukiSession,
  KabukiSessionSummary,
} from '@kestack/devtools-kabuki/devtools';

export class Sessions extends Context.Service<Sessions, SessionsService>()(
  'Kabuki/service/Sessions',
) {}

export interface SessionsService {
  readonly watch: Stream.Stream<
    ReadonlyArray<KabukiSessionSummary>,
    RpcClientError.RpcClientError
  >;
  readonly session: (name: string) => Layer.Layer<KabukiSession>;
}
