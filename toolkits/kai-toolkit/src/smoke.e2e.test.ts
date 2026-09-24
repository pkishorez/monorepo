import { NodeSocket } from '@effect/platform-node';
import { Effect, Layer, Stream } from 'effect';
import { RpcClient, RpcSerialization } from 'effect/unstable/rpc';
import { Socket } from 'effect/unstable/socket';
import { describe, expect, it } from 'vitest';
import { AiPlaygroundServerRpc } from './playground/contract/index.js';

const URL = process.env['AI_TOOLKIT_URL'] ?? 'ws://127.0.0.1:3999/rpc';

const protocol = RpcClient.layerProtocolSocket().pipe(
  Layer.provide([Socket.layerWebSocket(URL), RpcSerialization.layerJson]),
  Layer.provide(NodeSocket.layerWebSocketConstructor),
);

// Opt-in: needs `kai-toolkit serve --port 3999` running and a logged-in Claude
// Code. Run with `pnpm test:e2e`.
describe.skipIf(process.env['AI_TOOLKIT_E2E'] === undefined)(
  'playground server end to end',
  () => {
    it('runs a Claude turn and lands Messages and Thread status in the table', async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const api = yield* RpcClient.make(AiPlaygroundServerRpc);
          const threadId = crypto.randomUUID();
          const runId = crypto.randomUUID();
          yield* api.createThread({ id: threadId, harness: 'claude' });
          yield* api.claudeStart({
            threadId,
            runId,
            message: {
              id: crypto.randomUUID(),
              content: 'Reply with exactly the single word: pong',
            },
            model: 'claude-haiku-4-5',
            options: {},
          });
          const rows = yield* api
            .subscribeMessages({ threadId, '>': null })
            .pipe(
              Stream.flatMap((batch) => Stream.fromIterable(batch)),
              Stream.takeUntil(
                (row) =>
                  row.value.role === 'assistant' &&
                  row.value.data.parts.some(
                    (part) =>
                      part.type === 'text' &&
                      part.content.toLowerCase().includes('pong'),
                  ),
              ),
              Stream.runCollect,
              Effect.timeout('120 seconds'),
            );
          const idle = yield* api.subscribeThreads({ '>': null }).pipe(
            Stream.flatMap((batch) => Stream.fromIterable(batch)),
            Stream.filter((row) => row.value.id === threadId),
            Stream.takeUntil((row) => row.value.status === 'idle'),
            Stream.runCollect,
            Effect.timeout('30 seconds'),
          );
          return {
            roles: [...rows].map((row) => row.value.role),
            statuses: [...idle].map((row) => row.value.status),
            last: [...idle].at(-1)?.value,
          };
        }).pipe(Effect.provide(protocol), Effect.scoped),
      );

      expect(result.roles[0]).toBe('user');
      expect(result.roles).toContain('assistant');
      expect(result.statuses.at(-1)).toBe('idle');
      expect(result.last?.activeRunId).toBeNull();
      expect(result.last?.data).toMatchObject({ type: 'claude' });
      expect(
        result.last?.data.type === 'claude' && result.last.data.sessionId,
      ).toBeTruthy();
    }, 150_000);
  },
);
