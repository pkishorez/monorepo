import { RpcSerialization, RpcServer } from '@effect/rpc';
import { Layer } from 'effect';
import { HttpServer } from '@effect/platform';
import { createFileRoute } from '@tanstack/react-router';
import { TodosRpcLive } from '@/backend/api';
import { TodosRpc } from '@/backend/domain';

export const Route = createFileRoute('/api')({
  server: {
    handlers: {
      ANY: async ({ request }) => {
        const { handler } = RpcServer.toWebHandler(TodosRpc, {
          layer: Layer.mergeAll(
            TodosRpcLive,
            RpcSerialization.layerNdjson,
            HttpServer.layerContext,
          ),
        });

        return handler(request);
      },
    },
  },
});
