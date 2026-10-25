import { Effect, Fiber, Stream, type Scope } from 'effect';
import { describe, expect, it } from 'vitest';
import type { Agent, TurnOut } from '../../contract/index.js';
import type { AppServer } from '../app-server/index.js';

type Listener = Parameters<AppServer['listen']>[0];
import { openSession } from './thread.js';

/*
 * `codex app-server`, stood in for: requests answer at once, except
 * `turn/steer`, which waits for the test; the test sends notifications.
 */
const fakeServer = () => {
  const listeners = new Set<Listener>();
  const steers: Array<(ok: boolean) => void> = [];
  const starts: Array<Record<string, unknown>> = [];
  const skills: Array<() => void> = [];
  const answers: Record<string, unknown> = {
    'thread/start': { thread: { id: 'main' } },
    'turn/start': { turn: { id: 't1' } },
    'turn/interrupt': {},
    'thread/backgroundTerminals/list': { data: [], nextCursor: null },
  };
  const request = ((method: string, params: Record<string, unknown>) =>
    Effect.callback<unknown>((resume) => {
      if (method === 'turn/start') starts.push(params);
      // Skills are listed when the test says: a steer naming one waits.
      if (method === 'skills/list')
        return void skills.push(() => resume(Effect.succeed({ data: [] })));
      if (method === 'turn/steer')
        steers.push((ok) =>
          resume(ok ? Effect.succeed({}) : Effect.die('refused')),
        );
      else resume(Effect.succeed(answers[method] ?? {}));
    })) as unknown as AppServer['request'];
  const server: AppServer = {
    request,
    listen: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return {
    server,
    steers,
    starts,
    skills,
    notify: (method: string, params: unknown) => {
      for (const listener of listeners)
        listener.notification({ method, params } as never);
    },
  };
};

const said = (text: string) => ({
  threadId: 'main',
  turnId: 't1',
  item: { type: 'agentMessage', id: `m-${text}`, text },
});

const completed = {
  threadId: 'main',
  turn: { id: 't1', items: [], status: 'completed', error: null },
};

const kinds = (outs: Iterable<TurnOut>) =>
  [...outs].map((out) =>
    '_tag' in out
      ? out._tag === 'TurnEnd'
        ? `end ${out.status}`
        : `steered ${out.id}`
      : out.kind,
  );

const withSession = <A, E>(
  body: (
    session: Agent,
    fake: ReturnType<typeof fakeServer>,
  ) => Effect.Effect<A, E, Scope.Scope>,
) => {
  const fake = fakeServer();
  return Effect.runPromise(
    Effect.scoped(
      Effect.flatMap(
        openSession(fake.server, {
          cwd: '/tmp',
          model: 'gpt-test',
          sandbox: 'read-only',
          effort: 'low',
        }),
        (session) => body(session, fake),
      ),
    ),
  );
};

const until = (check: () => boolean) =>
  Effect.gen(function* () {
    while (!check()) yield* Effect.sleep(5);
  });

describe('a Codex turn', () => {
  it('marks a steer before what Codex says while the steer is being sent', () =>
    withSession((session, fake) =>
      Effect.gen(function* () {
        const turn = session.turn({ text: 'hi', images: [] });
        const read = yield* Effect.forkChild(Stream.runCollect(turn.out));
        const steer = yield* Effect.forkChild(
          turn.steer('s1', { text: 'also', images: [] }),
        );
        yield* until(() => fake.steers.length === 1);
        fake.notify('item/completed', said('answer'));
        fake.notify('turn/completed', completed);
        fake.steers[0]!(true);
        yield* Fiber.join(steer);
        expect(kinds(yield* Fiber.join(read))).toEqual([
          'steered s1',
          'item/completed',
          'turn/completed',
          'end done',
        ]);
      }),
    ));

  it(
    'ends with an unanswered steer marked taken when a cancel times out',
    () =>
      withSession((session, fake) =>
        Effect.gen(function* () {
          const turn = session.turn({ text: 'hi', images: [] });
          const read = yield* Effect.forkChild(Stream.runCollect(turn.out));
          yield* Effect.forkChild(
            turn.steer('s1', { text: 'also', images: [] }),
          );
          yield* until(() => fake.steers.length === 1);
          fake.notify('item/completed', said('partial'));
          yield* session.cancel;
          expect(kinds(yield* Fiber.join(read))).toEqual([
            'steered s1',
            'item/completed',
            'end cancelled',
          ]);
        }),
      ),
    15_000,
  );

  it(
    'leaves a steer still being prepared when a cancel times out for the next turn',
    () =>
      withSession((session, fake) =>
        Effect.gen(function* () {
          const turn = session.turn({ text: 'hi', images: [] });
          const read = yield* Effect.forkChild(Stream.runCollect(turn.out));
          yield* Effect.sleep(20);
          const steer = yield* Effect.forkChild(
            turn.steer('s1', { text: '/review this', images: [] }),
          );
          yield* Effect.sleep(20);
          yield* session.cancel;
          expect(kinds(yield* Fiber.join(read))).toEqual(['end cancelled']);
          // Prepared after its turn ended: refused, so it runs next, unsent.
          fake.skills[0]!();
          const refused = yield* Effect.flip(Fiber.join(steer));
          expect(refused.message).toBe(
            'Its Codex turn ended before the steer was sent',
          );
          expect(fake.steers).toHaveLength(0);
        }),
      ),
    15_000,
  );

  it('sends what a steer asked for, which turn/steer cannot carry, with the next turn/start', () =>
    withSession((session, fake) =>
      Effect.gen(function* () {
        const turn = session.turn({ text: 'hi', images: [] });
        const read = yield* Effect.forkChild(Stream.runCollect(turn.out));
        const steer = yield* Effect.forkChild(
          turn.steer('s1', {
            text: 'also',
            images: [],
            model: 'gpt-next',
            settings: { sandbox: 'danger-full-access' },
          }),
        );
        yield* until(() => fake.steers.length === 1);
        fake.steers[0]!(true);
        yield* Fiber.join(steer);
        fake.notify('turn/completed', completed);
        yield* Fiber.join(read);
        const next = session.turn({ text: 'then', images: [] });
        const reading = yield* Effect.forkChild(Stream.runCollect(next.out));
        yield* until(() => fake.starts.length === 2);
        expect(fake.starts[1]).toMatchObject({
          model: 'gpt-next',
          sandboxPolicy: { type: 'dangerFullAccess' },
        });
        fake.notify('turn/completed', completed);
        yield* Fiber.join(reading);
      }),
    ));

  it('refuses a steer once its turn has ended', () =>
    withSession((session, fake) =>
      Effect.gen(function* () {
        const turn = session.turn({ text: 'hi', images: [] });
        const read = yield* Effect.forkChild(Stream.runCollect(turn.out));
        yield* until(() => fake.steers.length === 0);
        yield* Effect.sleep(20);
        fake.notify('turn/completed', completed);
        yield* Fiber.join(read);
        const refused = yield* Effect.flip(
          turn.steer('late', { text: 'late', images: [] }),
        );
        expect(refused.message).toBe('Its Codex turn is not the one running');
      }),
    ));
});
