import { Effect, Fiber } from 'effect';
import { describe, expect, it } from 'vitest';
import { makeMailbox } from './interaction-mailbox.js';

describe('Mailbox', () => {
  it('emits before waiting and resolves the matching request', async () => {
    const events: string[] = [];
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const mailbox = yield* makeMailbox<string>();
        const fiber = yield* mailbox
          .ask('permission-1', {
            kind: 'permission',
            emit: () => void events.push('emitted'),
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
          emit: () => {},
          timeoutMs: 1,
          timeoutAnswer: 'denied by timeout',
          cancelAnswer: 'cancelled',
        });
      }),
    );

    expect(result).toBe('denied by timeout');
  });
});
