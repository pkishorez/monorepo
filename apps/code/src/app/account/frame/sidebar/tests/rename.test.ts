import { Effect, Layer, Stream } from 'effect';
import {
  CodeClient,
  CodeClients,
  SessionNotFound,
} from '@kestack/connect/code';
import { Actor, Runtime } from '@kestack/kabuki';
import { Navigation } from '@kestack/kabuki/routing';
import type { Instance } from '@kestack/kabuki/types';
import { connection as RpcConnection } from '@kestack/rpc-toolkit/rpc/websocket';
import { describe, expect, it } from 'vitest';
import { connectionFilterMemory } from '../../store.ts';
import { Preferences, nothing } from '../../../../storage/index.ts';
import { Connections, nobody } from '../../../account.ts';
import { Moves } from '../../../connection/records/index.ts';
import { SidebarLive } from '../actor.ts';

/*
 * A Session given a Title from its row: asked of its Connection as typed,
 * and a refusal said, each once.
 */

const Owner = Actor.define('Owner', {});
const OwnerLive = Owner.build({
  children: {
    sidebar: Actor.child(SidebarLive, { props: () => ({ accountId: 'a1' }) }),
  },
});

const given: Array<{ connectionId: string; sessionId: string; title: string }> =
  [];

const layer = Layer.mergeAll(
  connectionFilterMemory(),
  Layer.mock(Moves)({ intents: Stream.never, refusals: Stream.never }),
  Layer.mock(Connections)({
    state: Stream.concat(Stream.make(nobody), Stream.never),
  }),
  Layer.mock(Preferences)({
    read: Effect.succeed(nothing),
    changes: Stream.never,
  }),
  Layer.mock(Navigation)({ push: () => Effect.void }),
  // Each Connection's client notes the Title given; 'gone' is no longer there.
  CodeClients.make((connectionId) =>
    Layer.merge(
      Layer.mock(CodeClient)({
        setTitle: (({ sessionId, title }) =>
          sessionId === 'gone'
            ? Effect.fail(new SessionNotFound({ id: sessionId }))
            : Effect.sync(() => {
                given.push({ connectionId, sessionId, title });
                return title;
              })) as CodeClient['Service']['setTitle'],
      }),
      Layer.mock(RpcConnection)({
        hooks: { onConnect: Effect.void, onDisconnect: Effect.void },
      }),
    ),
  ),
);

const wait = (ms = 30) =>
  Effect.promise(() => new Promise((done) => setTimeout(done, ms)));

describe('a Session renamed from its row', () => {
  it('is asked of its Connection, and a refusal is said', async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const app = (yield* Runtime.scoped(OwnerLive as never, {
            layer: layer as never,
          })) as Runtime;
          const sidebar = () =>
            app.snapshot.root.children['sidebar'] as Instance;
          const rename = (sessionId: string, title: string) =>
            app.at(sidebar().address)?.send({
              _tag: 'RenameAsked',
              connectionId: 'm1',
              sessionId,
              title,
            } as never);
          rename('s1', 'Fix the sign-in');
          yield* wait();
          expect(given).toEqual([
            { connectionId: 'm1', sessionId: 's1', title: 'Fix the sign-in' },
          ]);
          expect((sidebar().model as { unrenamed: unknown }).unrenamed).toBe(
            null,
          );
          rename('gone', 'Anything');
          yield* wait();
          expect((sidebar().model as { unrenamed: unknown }).unrenamed).toEqual(
            { n: 1, reason: 'This session no longer exists' },
          );
        }),
      ) as Effect.Effect<void>,
    );
  });
});
