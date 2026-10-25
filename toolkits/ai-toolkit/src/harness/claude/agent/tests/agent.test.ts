import { Effect, Fiber, Stream, type Scope } from 'effect';
import { describe, expect, it, vi } from 'vitest';
import type { TurnOut } from '../../../contract/index.js';
import { openSdkAgent, type SdkAgent } from '../agent.js';

/*
 * The live query, stood in for: a test feeds the records Claude Code would
 * emit and reads the user messages the session sends.
 */
const live = vi.hoisted(() => {
  /** The records the current query has yet to yield. */
  let records: Array<unknown> = [];
  let wake: (() => void) | undefined;
  const sent: Array<{ uuid: string; text: unknown }> = [];
  /** Settles the model change the query is making, if any. */
  let modelChange: ((ok: boolean) => void) | undefined;
  return {
    sent,
    settleModelChange: (ok: boolean) => modelChange?.(ok),
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
        setModel: () =>
          new Promise<void>((resolve, reject) => {
            modelChange = (ok) =>
              ok ? resolve() : reject(new Error('no such model'));
          }),
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
  body: (session: SdkAgent) => Effect.Effect<A, E, Scope.Scope>,
) =>
  Effect.runPromise(
    Effect.scoped(
      Effect.flatMap(
        openSdkAgent({
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

/** Each element's kind: a record's own, or what the turn's stream says. */
const kinds = (outs: Iterable<TurnOut>) =>
  [...outs].map((out) =>
    '_tag' in out
      ? out._tag === 'TurnEnd'
        ? `end ${out.status} ${out.forkPoint}`
        : `steered ${out.id}`
      : out.kind,
  );

describe('openSdkAgent', () => {
  it("ends each turn with its own Fork Point, an agent turn read after a user turn's included", () =>
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
            session.turn({ text: 'hi', images: [], options: {} }).out,
          ),
        );
        const [uuid] = yield* sentNow(1);
        live.emit(init);
        live.emit(said('user-1'));
        live.emit(result([uuid!]));
        expect(kinds(yield* Fiber.join(userTurn))).toEqual([
          'system/init',
          'assistant',
          'result',
          'end done user-1',
        ]);

        expect(kinds(yield* Stream.runCollect(agentTurn[0]!.out))).toEqual([
          'system/init',
          'assistant',
          'result',
          'end done agent-1',
        ]);
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
          Stream.runCollect(agentTurn[0]!.out),
        );

        const user = session.turn({ text: 'hi', images: [], options: {} });
        const userTurn = yield* Effect.forkChild(Stream.runCollect(user.out));
        const steer = yield* Effect.forkChild(
          user.steer('steer-1', { text: 'also', images: [], options: {} }),
        );
        yield* Effect.sleep('20 millis');
        expect(live.sent).toHaveLength(0);

        live.emit(result([]));
        expect(kinds(yield* Fiber.join(agentRead))).toEqual([
          'system/init',
          'assistant',
          'result',
          'end done agent-1',
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
          'steered steer-1',
          'system/init',
          'result',
          'result',
          `end done ${turnId}`,
        ]);
      }),
    ));

  it("ends a cancelled turn cancelled, a Background Job's result before it notwithstanding", () =>
    withSession((session) =>
      Effect.gen(function* () {
        const userTurn = yield* Effect.forkChild(
          Stream.runCollect(
            session.turn({ text: 'hi', images: [], options: {} }).out,
          ),
        );
        const [uuid] = yield* sentNow(1);
        live.emit(init);
        live.emit(result([]));
        yield* session.cancel;
        live.emit({
          type: 'result',
          subtype: 'error_during_execution',
          terminal_reason: 'aborted_streaming',
          user_message_uuids: [uuid],
        });
        expect(kinds(yield* Fiber.join(userTurn))).toEqual([
          'system/init',
          'result',
          'result',
          `end cancelled ${uuid}`,
        ]);
      }),
    ));

  it('refuses a steer once its turn has ended', () =>
    withSession((session) =>
      Effect.gen(function* () {
        const user = session.turn({ text: 'hi', images: [], options: {} });
        const userTurn = yield* Effect.forkChild(Stream.runCollect(user.out));
        const [uuid] = yield* sentNow(1);
        live.emit(init);
        live.emit(result([uuid!]));
        yield* Fiber.join(userTurn);
        const refused = yield* Effect.flip(
          user.steer('late', { text: 'late', images: [], options: {} }),
        );
        expect(refused.message).toBe('Its turn is not the one running');
      }),
    ));

  it("steers only the turn it was given, not the agent's next one", () =>
    withSession((session) =>
      Effect.gen(function* () {
        // The agent ends one turn of its own and starts another before
        // either is read.
        live.emit(init);
        live.emit(said('agent-1'));
        live.emit(result([]));
        live.emit(init);
        live.emit(said('agent-2'));
        const [first, second] = yield* Stream.runCollect(
          Stream.take(session.agentTurns, 2),
        );

        const refused = yield* Effect.flip(
          first!.steer('s1', { text: 'late', images: [], options: {} }),
        );
        expect(refused.message).toBe('Its turn is not the one running');
        expect(kinds(yield* Stream.runCollect(first!.out))).toEqual([
          'system/init',
          'assistant',
          'result',
          'end done agent-1',
        ]);

        yield* second!.steer('s2', { text: 'now', images: [], options: {} });
        const [steerId] = yield* sentNow(1);
        live.emit(result([steerId!]));
        expect(kinds(yield* Stream.runCollect(second!.out))).toEqual([
          'system/init',
          'assistant',
          'steered s2',
          'result',
          'end done agent-2',
        ]);
      }),
    ));

  it('ends a turn whose steer could not change the model as its last result did, shown once', () =>
    withSession((session) =>
      Effect.gen(function* () {
        const user = session.turn({ text: 'hi', images: [], options: {} });
        const userTurn = yield* Effect.forkChild(Stream.runCollect(user.out));
        const [uuid] = yield* sentNow(1);
        live.emit(init);
        const steer = yield* Effect.forkChild(
          user.steer('s1', {
            text: 'also',
            images: [],
            options: { model: 'claude-other' },
          }),
        );
        yield* Effect.sleep('20 millis');
        live.emit(result([uuid!]));
        yield* Effect.sleep('20 millis');
        live.settleModelChange(false);
        expect((yield* Fiber.await(steer))._tag).toBe('Failure');
        const outs = [...(yield* Fiber.join(userTurn))];
        expect(kinds(outs)).toEqual([
          'system/init',
          'result',
          `end done ${uuid}`,
        ]);
        expect(outs.at(-1)).toMatchObject({ shown: true });
      }),
    ));
});
