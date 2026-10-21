import { Effect, Fiber, Stream, type Scope } from 'effect';
import { describe, expect, it, vi } from 'vitest';
import type { RawOut } from '../../../harness/index.js';
import { openSdkSession, type SdkSession } from './sdk-session.js';

/*
 * The live query, stood in for: a test feeds the records Claude Code would
 * emit and reads the user messages the session sends.
 */
const live = vi.hoisted(() => {
  /** The records the current query has yet to yield. */
  let records: Array<unknown> = [];
  let wake: (() => void) | undefined;
  const sent: Array<{ uuid: string; text: unknown }> = [];
  return {
    sent,
    emit: (record: unknown) => {
      records.push(record);
      wake?.();
    },
    query: ({
      prompt,
    }: {
      prompt: AsyncIterable<{ uuid: string; message: { content: unknown } }>;
    }) => {
      const mine: Array<unknown> = [];
      records = mine;
      let closed = false;
      sent.length = 0;
      void (async () => {
        for await (const message of prompt)
          sent.push({ uuid: message.uuid, text: message.message.content });
      })();
      return {
        async *[Symbol.asyncIterator]() {
          while (!closed) {
            const next = mine.shift();
            if (next !== undefined) yield next;
            else await new Promise<void>((resolve) => (wake = resolve));
          }
        },
        interrupt: async () => {},
        close: () => {
          closed = true;
          wake?.();
        },
        stopTask: async () => {},
      };
    },
  };
});

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({ query: live.query }));

const init = { type: 'system', subtype: 'init', session_id: 'native' };
const said = (uuid: string) => ({
  type: 'assistant',
  uuid,
  parent_tool_use_id: null,
  message: { id: uuid, content: [] },
});
const result = (answered: ReadonlyArray<string>) =>
  answered.length === 0
    ? { type: 'result', subtype: 'success', origin: 'task-notification' }
    : { type: 'result', subtype: 'success', user_message_uuids: answered };

const sentNow = (count: number) =>
  Effect.promise(() =>
    vi.waitFor(() => {
      expect(live.sent).toHaveLength(count);
      return live.sent.map((each) => each.uuid);
    }),
  );

const withSession = <A, E>(
  body: (session: SdkSession) => Effect.Effect<A, E, Scope.Scope>,
) =>
  Effect.runPromise(
    Effect.scoped(
      Effect.flatMap(
        openSdkSession({
          cwd: '/tmp',
          executable: undefined,
          model: 'claude-test',
          effort: 'high',
          permissionMode: 'default',
        }),
        body,
      ),
    ),
  );

const kinds = (outs: ReadonlyArray<RawOut>) => outs.map((out) => out.kind);

describe('openSdkSession', () => {
  it('keeps the Fork Point of a user turn that ran after an agent turn read later', () =>
    withSession((session) =>
      Effect.gen(function* () {
        // The agent starts and ends a turn of its own; nobody reads it yet.
        live.emit(init);
        live.emit(said('agent-1'));
        live.emit(result([]));
        const agentTurns = yield* Stream.toPull(session.agentTurns);
        const agentTurn = yield* agentTurns;

        const userTurn = yield* Effect.forkChild(
          Stream.runCollect(
            session.turn({ text: 'hi', images: [], options: {} }),
          ),
        );
        const [uuid] = yield* sentNow(1);
        live.emit(init);
        live.emit(said('user-1'));
        live.emit(result([uuid!]));
        yield* Fiber.join(userTurn);
        expect(yield* session.lastTurnNativeId).toBe('user-1');

        yield* Stream.runDrain(agentTurn[0]!);
        expect(yield* session.lastTurnNativeId).toBe('user-1');
      }),
    ));

  it('holds a steer sent before its turn has started, then joins it', () =>
    withSession((session) =>
      Effect.gen(function* () {
        // An agent turn runs, so the user turn waits to start.
        live.emit(init);
        live.emit(said('agent-1'));
        const agentTurns = yield* Stream.toPull(session.agentTurns);
        const agentTurn = yield* agentTurns;
        const agentRead = yield* Effect.forkChild(
          Stream.runCollect(agentTurn[0]!),
        );

        const userTurn = yield* Effect.forkChild(
          Stream.runCollect(
            session.turn({ text: 'hi', images: [], options: {} }),
          ),
        );
        const steer = yield* Effect.forkChild(
          session.steer({ text: 'also', images: [], options: {} }),
        );
        yield* Effect.sleep('20 millis');
        expect(live.sent).toHaveLength(0);

        live.emit(result([]));
        expect(kinds(yield* Fiber.join(agentRead))).toEqual([
          'system/init',
          'assistant',
          'result',
        ]);
        yield* Fiber.join(steer);
        const [turnId, steerId] = yield* sentNow(2);
        expect(live.sent.map((each) => each.text)).toEqual(['hi', 'also']);

        // The user turn ends only once its steer is answered too.
        live.emit(init);
        live.emit(result([turnId!]));
        yield* Effect.sleep('20 millis');
        expect(userTurn.pollUnsafe()).toBeUndefined();
        live.emit(result([steerId!]));
        expect(kinds(yield* Fiber.join(userTurn))).toEqual([
          'system/init',
          'result',
          'result',
        ]);
      }),
    ));

  it('refuses a steer once its turn has ended', () =>
    withSession((session) =>
      Effect.gen(function* () {
        const userTurn = yield* Effect.forkChild(
          Stream.runCollect(
            session.turn({ text: 'hi', images: [], options: {} }),
          ),
        );
        const [uuid] = yield* sentNow(1);
        live.emit(init);
        live.emit(result([uuid!]));
        yield* Fiber.join(userTurn);
        const refused = yield* Effect.flip(
          session.steer({ text: 'late', images: [], options: {} }),
        );
        expect(refused.message).toBe('No turn is running to steer');
      }),
    ));
});
