import type { Rpc, RpcGroup } from 'effect/unstable/rpc';
import { validateTrustedOrigins } from 'auth-toolkit/worker';
import { DurableRpcWorker } from 'rpc-toolkit/rpc/cloudflare/alchemy/durable-rpc-worker';
import { DurableSignalingRpcs } from '../rpc/index.js';
import {
  durableSignalingConnection,
  durableSignalingHandlers,
  type DurableConnection,
} from '../worker/index.js';

type DurableSignalingRpc =
  typeof DurableSignalingRpcs extends RpcGroup.RpcGroup<infer Rpcs>
    ? Rpcs
    : Rpc.Any;

export interface DurableSignalingWorkerOptions {
  readonly main: string;
  readonly authWorkerUrl: string;
  readonly trustedOrigins: ReadonlyArray<string>;
  readonly domain?: string;
  readonly dev?: { readonly port: number };
  readonly workersDev?: boolean;
}

export const DurableSignalingWorker =
  <Self>() =>
  (id: string, options: DurableSignalingWorkerOptions) => {
    validateTrustedOrigins(options.trustedOrigins);
    return DurableRpcWorker<Self>()<
      DurableSignalingRpc,
      never,
      DurableConnection
    >(
      id,
      {
        main: options.main,
        schema: DurableSignalingRpcs,
        connection: (state) => durableSignalingConnection(options, state),
        ...(options.workersDev !== undefined && {
          workersDev: options.workersDev,
        }),
        ...(options.domain !== undefined && { domain: options.domain }),
        ...(options.dev !== undefined && { dev: { port: options.dev.port } }),
      },
      durableSignalingHandlers,
    );
  };
