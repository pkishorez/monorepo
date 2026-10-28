import { Effect, Fiber, Option, Stream, type Scope } from 'effect';
import { describe, expect, it } from 'vitest';
import {
  QuestionNotAsked,
  type Agent,
  type TurnOut,
} from '../../../contract/index.js';
import type {
  AppServer,
  QuestionRequest,
  UserInputResponse,
} from '../../app-server/index.js';

type Listener = Parameters<AppServer['listen']>[0];
import { openSession } from '../thread.js';

/*
 * `codex app-server`, stood in for: requests answer at once, except
 * `turn/steer`, which waits for the test; the test sends notifications.
 */
const fakeServer = () => {
  const listeners = new Set<Listener>();
  const takers = new Set<(request: QuestionRequest) => boolean>();
  /** What each question was answered with, by request id. */
  const responses = new Map<number, UserInputResponse>();
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
    takeQuestions: (take) => {
      takers.add(take);
      return () => takers.delete(take);
    },
  };
  return {
    server,
    steers,
    starts,
    skills,
    responses,
    notify: (method: string, params: unknown) => {
      for (const listener of listeners)
        listener.notification({ method, params } as never);
    },
    /** The agent asks, as Codex does with `item/tool/requestUserInput`. */
    ask: (id: number, params: typeof asked = asked) =>
      [...takers].some((take) =>
        take({
          id,
          params,
          respond: (response) => responses.set(id, response),
        }),
      ),
  };
};

const said = (text: string) => ({
  threadId: 'main',
  turnId: 't1',
  item: { type: 'agentMessage', id: `m-${text}`, text },
});

const asked = {
  threadId: 'main',
  turnId: 't1',
  itemId: 'call_1',
  questions: [
    {
      id: 'colour',
      header: 'Colour',
      question: 'Which colour?',
      isOther: true,
      isSecret: false,
      options: [
        { label: 'Red', description: 'Warm' },
        { label: 'Blue', description: 'Cool' },
      ],
    },
    {
      id: 'name',
      header: 'Name',
      question: 'What name?',
      isOther: false,
      isSecret: false,
      options: null,
    },
  ],
};

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

describe('an Agent Question', () => {
  const listed = (session: Agent, count: number) =>
    session.questions.pipe(
      Stream.filter((list) => list.length === count),
      Stream.runHead,
      Effect.map(Option.getOrThrow),
    );

  it('is listed while Codex waits, answered, and recorded both times', () =>
    withSession((session, fake) =>
      Effect.gen(function* () {
        const turn = session.turn({ text: 'hi', images: [] });
        const read = yield* Effect.forkChild(Stream.runCollect(turn.out));
        yield* until(() => fake.starts.length === 1);
        expect(fake.ask(7)).toBe(true);
        const [question] = yield* listed(session, 1);
        expect(question).toMatchObject({
          id: 'call_1',
          items: [
            {
              id: 'colour',
              options: [{ label: 'Red', description: 'Warm' }, {}],
              multiSelect: false,
              other: true,
            },
            { id: 'name', options: [] },
          ],
        });
        yield* session.answer('call_1', { colour: ['Blue'], name: ['Ada'] });
        expect(fake.responses.get(7)).toEqual({
          answers: {
            colour: { answers: ['Blue'] },
            name: { answers: ['Ada'] },
          },
        });
        yield* listed(session, 0);
        const again = yield* Effect.flip(session.answer('call_1', null));
        expect(again).toEqual(new QuestionNotAsked({ id: 'call_1' }));
        // Codex says it is settled, as it does after every answer.
        fake.notify('serverRequest/resolved', {
          threadId: 'main',
          requestId: 7,
        });
        fake.notify('turn/completed', completed);
        const outs = [...(yield* Fiber.join(read))];
        expect(kinds(outs)).toEqual([
          'question.asked',
          'question.answered',
          'turn/completed',
          'end done',
        ]);
        expect(outs[1]).toMatchObject({
          payload: {
            itemId: 'call_1',
            headers: { colour: 'Colour', name: 'Name' },
            answers: { colour: ['Blue'], name: ['Ada'] },
          },
        });
      }),
    ));

  it('answers every question with nothing when declined', () =>
    withSession((session, fake) =>
      Effect.gen(function* () {
        const turn = session.turn({ text: 'hi', images: [] });
        yield* Effect.forkChild(Stream.runDrain(turn.out));
        yield* until(() => fake.starts.length === 1);
        fake.ask(1);
        yield* listed(session, 1);
        yield* session.answer('call_1', null);
        expect(fake.responses.get(1)).toEqual({
          answers: { colour: { answers: [] }, name: { answers: [] } },
        });
      }),
    ));

  it('goes when Codex settles it on its own', () =>
    withSession((session, fake) =>
      Effect.gen(function* () {
        const turn = session.turn({ text: 'hi', images: [] });
        yield* Effect.forkChild(Stream.runDrain(turn.out));
        yield* until(() => fake.starts.length === 1);
        fake.ask(3);
        yield* listed(session, 1);
        fake.notify('serverRequest/resolved', {
          threadId: 'main',
          requestId: 3,
        });
        yield* listed(session, 0);
        expect(fake.responses.has(3)).toBe(false);
      }),
    ));

  it('is left for the server to decline when no turn runs', () =>
    withSession((session, fake) =>
      Effect.gen(function* () {
        expect(fake.ask(2)).toBe(false);
        expect(yield* listed(session, 0)).toEqual([]);
      }),
    ));

  it("never records a secret's answer", () =>
    withSession((session, fake) =>
      Effect.gen(function* () {
        const turn = session.turn({ text: 'hi', images: [] });
        const read = yield* Effect.forkChild(Stream.runCollect(turn.out));
        yield* until(() => fake.starts.length === 1);
        const [colour, name] = asked.questions;
        fake.ask(5, {
          ...asked,
          questions: [colour!, { ...name!, isSecret: true }],
        });
        yield* listed(session, 1);
        yield* session.answer('call_1', { colour: ['Red'], name: ['s3cr3t'] });
        expect(fake.responses.get(5)).toMatchObject({
          answers: { name: { answers: ['s3cr3t'] } },
        });
        fake.notify('turn/completed', completed);
        const outs = [...(yield* Fiber.join(read))];
        expect(outs[1]).toMatchObject({
          payload: { answers: { colour: ['Red'], name: ['(hidden)'] } },
        });
        expect(JSON.stringify(outs)).not.toContain('s3cr3t');
      }),
    ));

  it('goes, declined, when its turn ends', () =>
    withSession((session, fake) =>
      Effect.gen(function* () {
        const turn = session.turn({ text: 'hi', images: [] });
        const read = yield* Effect.forkChild(Stream.runCollect(turn.out));
        yield* until(() => fake.starts.length === 1);
        fake.ask(4);
        yield* listed(session, 1);
        fake.notify('turn/completed', completed);
        const outs = [...(yield* Fiber.join(read))];
        expect(kinds(outs)).toEqual([
          'question.asked',
          'turn/completed',
          'question.answered',
          'end done',
        ]);
        expect(outs[2]).toMatchObject({ payload: { answers: null } });
        expect(fake.responses.get(4)).toEqual({
          answers: { colour: { answers: [] }, name: { answers: [] } },
        });
        yield* listed(session, 0);
      }),
    ));
});
