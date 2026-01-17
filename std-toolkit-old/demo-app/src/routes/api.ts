// import { RpcSerialization, RpcServer } from '@effect/rpc';
// import { Layer } from 'effect';
// import { HttpServer } from '@effect/platform';
import { createFileRoute } from '@tanstack/react-router';
// import { TodosRpcLive } from '@/backend/dynamo/api';
// import { TodosRpc } from '@/backend/domain';
import { env } from 'cloudflare:workers';

export const Route = createFileRoute('/api')({
  server: {
    handlers: {
      ANY: async ({ request }) => {
        return env.DURABLE.fetch(request);

        // const { handler } = RpcServer.toWebHandler(TodosRpc, {
        //   layer: Layer.mergeAll(
        //     TodosRpcLive,
        //     RpcSerialization.layerNdjson,
        //     HttpServer.layerContext,
        //   ),
        // });
        //
        // return handler(request);
      },
    },
  },
});
