import { Agent, Connection, getAgentByName, WSMessage } from 'agents';
import { executeRpc } from '@kishorez/effect-cf/websocket/server.js';
import { JobScheduler } from '@kishorez/effect-cf/job.js';
import { ping, pong } from '@kishorez/effect-cf/websocket/hybernation.js';
import { BroadcastService } from '@std-toolkit/core/broadcast.js';
import {
  ConnectionService,
  isSubscriptionEqual,
  matchesBroadcast,
  SubscriptionType,
} from '@std-toolkit/core/connection.js';
import { Browsable, studio } from '@outerbase/browsable-durable-object';
import type { durableWorker } from '../alchemy.run.ts';
import { SqliteDB, SqliteDO } from './backend/sqlite/db.ts';
import { Effect, Layer, ManagedRuntime, Match } from 'effect';
// NOTE: To prevent conflict with cloudflare's Queue
import { TodosRpcLive } from './backend/sqlite/api.ts';
// import { TodosRpcLive } from './backend/dynamo/api.ts';
import { RpcSerialization, RpcServer } from '@effect/rpc';
import { HttpServer } from '@effect/platform';
import { TodosRpc } from './backend/domain.ts';
import { ObservabilityLayer } from './common/observability.ts';
import { broadcastSchema } from '@std-toolkit/core/schema.js';

interface ConnectionState {
  subscriptions: SubscriptionType[];
}

@Browsable()
export class DurableTest extends Agent<unknown, unknown> {
  runtime!: ManagedRuntime.ManagedRuntime<SqliteDB, never>;
  layer!: Layer.Layer<SqliteDB>;

  async onStart() {
    this.ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair(ping, pong),
    );
    const layer = Layer.mergeAll(
      Layer.succeed(
        BroadcastService,
        BroadcastService.of({
          broadcast: ({ value, ...config }) => {
            const data = broadcastSchema.parse(value);
            const allConnections = Array.from(
              this.getConnections<ConnectionState>(),
            );

            if (config.to === 'self') {
              return allConnections
                .filter((v) => config.connectionIds.includes(v.id))
                .forEach((connection) => {
                  connection.send(JSON.stringify(data));
                });
            }
            const connections = Match.value(config).pipe(
              Match.when({ to: 'others' }, ({ connectionIds }) =>
                allConnections.filter((v) => !connectionIds.includes(v.id)),
              ),
              Match.when({ to: 'all' }, () => allConnections),
              Match.exhaustive,
            );
            console.log('CONNECTIONS TO BROADCAST:', connections.length);
            connections.forEach((connection) => {
              if (
                connection.state?.subscriptions.some((subscription) =>
                  matchesBroadcast(subscription, data),
                )
              ) {
                connection.send(JSON.stringify(data));
              }
            });
          },
        }),
      ),
      Layer.provide(
        SqliteDB.Default,
        Layer.succeed(SqliteDO, this.ctx.storage.sql),
      ),
      ObservabilityLayer,
      JobScheduler.Default,
    );
    this.runtime = ManagedRuntime.make(layer);
    this.layer = Layer.effectContext(
      this.runtime.runtimeEffect.pipe(Effect.map((v) => v.context)),
    );
    await this.#setupTable();
  }

  async onMessage(connection: Connection<ConnectionState>, message: WSMessage) {
    const layer = TodosRpcLive.pipe(
      Layer.merge(
        Layer.succeed(
          ConnectionService,
          ConnectionService.of({
            connectionId: connection.id,
            subscribe(value) {
              const subscriptions = connection.state?.subscriptions ?? [];
              if (subscriptions?.some((v) => isSubscriptionEqual(v, value)))
                return;

              connection.setState({
                ...connection.state,
                subscriptions: [...subscriptions, value],
              });
            },
            unsubscribe(value) {
              const subscriptions = connection.state?.subscriptions ?? [];
              connection.setState({
                ...connection.state,
                subscriptions: subscriptions.filter(
                  (v) => !isSubscriptionEqual(v, value),
                ),
              });
            },
          }),
        ),
      ),
    );
    return this.runtime.runPromise(
      executeRpc(
        TodosRpc,
        message.toString(),
        connection.send.bind(connection),
      ).pipe(Effect.provide(layer)),
    );
  }

  async onRequest(request: Request) {
    const layer = Layer.provideMerge(
      Layer.mergeAll(
        TodosRpcLive,
        RpcSerialization.layerNdjson,
        HttpServer.layerContext,
      ),
      this.layer,
    );
    const { handler, dispose } = RpcServer.toWebHandler(TodosRpc, {
      layer,
      memoMap: this.runtime.memoMap,
    });

    try {
      const response = await handler(request);
      this.ctx.waitUntil(dispose());
      return response;
    } catch (err) {
      console.error(err);
      throw err;
    }
  }

  async #setupTable() {
    await Effect.runPromise(
      Effect.gen(function* () {
        const { table } = yield* SqliteDB;
        table.setupTable({ debug: false });
      }).pipe(Effect.provide(this.runtime)),
    );
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
    return (await getAgentByName(env.DURABLE_TEST, 'test')).fetch(request);
  },
};
