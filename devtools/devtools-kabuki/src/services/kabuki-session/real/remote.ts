import { Effect, Layer } from 'effect';
import { RpcClient } from 'effect/rpc';
import { protocolTo, sessionPath } from '../../../server/rpc/contract/index.ts';
import { KabukiSessionRpcs } from '../../../server/rpc/session/contract/index.ts';
import { KabukiSession } from '../contract/index.ts';

export const remote = (
  origin: string,
  name: string,
): Layer.Layer<KabukiSession> =>
  Layer.effect(KabukiSession)(
    Effect.flatMap(protocolTo(origin, sessionPath(name)), (protocol) =>
      RpcClient.make(KabukiSessionRpcs).pipe(
        Effect.provideService(RpcClient.Protocol, protocol),
      ),
    ),
  );
