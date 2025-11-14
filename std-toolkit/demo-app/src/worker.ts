import { DurableObject, env } from 'cloudflare:workers';
import { Browsable, studio } from '@outerbase/browsable-durable-object';
import type { durableWorker } from '../alchemy.run.ts';
import { SqliteDB, SqliteDO } from './backend/sqlite/db.ts';
import { Layer } from 'effect';
import { TodosRpcLive } from './backend/sqlite/api.ts';
import { RpcSerialization, RpcServer } from '@effect/rpc';
import { HttpServer } from '@effect/platform';
import { TodosRpc } from './backend/domain.ts';

@Browsable()
export class DurableTest extends DurableObject {
  layer: Layer.Layer<SqliteDB, never>;
  constructor(ctx: DurableObjectState) {
    super(ctx, env);
    this.layer = Layer.provide(
      SqliteDB.Default,
      Layer.succeed(SqliteDO, ctx.storage.sql),
    );
  }

  async fetch(request: Request) {
    const layer = Layer.provideMerge(
      Layer.mergeAll(
        TodosRpcLive,
        RpcSerialization.layerNdjson,
        HttpServer.layerContext,
      ),

      this.layer,
    );
    const { handler } = RpcServer.toWebHandler(TodosRpc, {
      layer,
    });

    try {
      console.log('REQ: ', request.method, request.url);
      return await handler(request);
    } catch (err) {
      console.error(err);
      throw err;
    }
  }
}

export default {
  async fetch(request: Request, env: typeof durableWorker.Env) {
    const url = new URL(request.url);
    if (url.pathname === '/__studio') {
      return await studio(request, env.DURABLE_TEST, {
        basicAuth: { username: 'admin', password: 'password' },
      });
    }
    return env.DURABLE_TEST.getByName('test').fetch(request);
  },
};
