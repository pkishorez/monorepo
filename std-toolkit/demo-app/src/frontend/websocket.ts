import { Effect } from 'effect';
import { makeRobustProtocol } from '@kishorez/effect-cf/websocket/client.js';
import { RpcClient } from '@effect/rpc';
import { TodosRpc } from '@/backend/domain';
import { Socket } from '@effect/platform';
import { ulid } from 'ulid';
import { todoCollection } from './collection';
import { broadcastSchema } from '@std-toolkit/core/schema.js';

export class WebSocketService extends Effect.Service<WebSocketService>()(
  'WebSocketService',
  {
    dependencies: [Socket.layerWebSocketConstructorGlobal],
    scoped: Effect.gen(function* () {
      const effects: Effect.Effect<any, any>[] = [];
      const socketClient = yield* RpcClient.make(TodosRpc, {}).pipe(
        Effect.provide(
          makeRobustProtocol({
            url: `ws://localhost:1337/agents/durable-test/default?_pk=${ulid()}`,
            onJsonResponse: (v) => {
              try {
                console.log('VALUE: ', v);
                const parsed = broadcastSchema.parse(v);
                console.log('PARSED: ', parsed);
                [todoCollection]
                  .find((v) => v.name === parsed.meta._e)
                  ?.broadcast(parsed, true);
              } catch (err) {
                console.error('ERROR: ', err);
              }
            },
          }),
        ),
      );

      const subscribeEffect = <A, E>(effect: Effect.Effect<A, E>) =>
        Effect.gen(function* () {
          effects.push(effect);
          const value = yield* effect;

          return {
            value,
            unsubscribe: () => effects.splice(effects.indexOf(effect), 1),
          };
        });

      return { socketClient, subscribeEffect };
    }),
  },
) {}
