import { Effect, Fiber, Option, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { AgentChunkSchema, makeMailbox } from './run-state.js';

describe('AgentChunkSchema', () => {
  it('rejects malformed chunks and preserves extension fields', () => {
    const decode = Schema.decodeUnknownOption(AgentChunkSchema);
    expect(
      Option.isNone(
        decode({ type: 'TEXT_MESSAGE_CONTENT', messageId: 'message-1' }),
      ),
    ).toBe(true);
    expect(
      Option.getOrThrow(
        decode({
          type: 'TEXT_MESSAGE_CONTENT',
          messageId: 'message-1',
          delta: 'hello',
          metadata: { provider: 'test' },
        }),
      ),
    ).toMatchObject({ metadata: { provider: 'test' } });
  });
});

describe('Mailbox', () => {
  it('emits before waiting and resolves the matching request', async () => {
    const events: string[] = [];
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const mailbox = yield* makeMailbox<string>();
        const fiber = yield* mailbox
          .ask('permission-1', {
            kind: 'permission',
            emit: Effect.sync(() => events.push('emitted')).pipe(Effect.asVoid),
            timeoutMs: 1_000,
            timeoutAnswer: 'timeout',
            cancelAnswer: 'cancelled',
          })
          .pipe(Effect.forkChild);
        yield* Effect.yieldNow;
        expect(events).toEqual(['emitted']);
        expect(yield* mailbox.pending).toMatchObject([
          { requestId: 'permission-1', kind: 'permission' },
        ]);
        expect(yield* mailbox.resolve('permission-1', 'allowed')).toBe(true);
        const answer = yield* Fiber.join(fiber);
        expect(yield* mailbox.resolve('permission-1', 'allowed')).toBe(true);
        return answer;
      }),
    );

    expect(result).toBe('allowed');
  });

  it('uses the explicit timeout answer', async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const mailbox = yield* makeMailbox<string>();
        return yield* mailbox.ask('permission-1', {
          kind: 'permission',
          emit: Effect.void,
          timeoutMs: 1,
          timeoutAnswer: 'denied by timeout',
          cancelAnswer: 'cancelled',
        });
      }),
    );

    expect(result).toBe('denied by timeout');
  });
});
