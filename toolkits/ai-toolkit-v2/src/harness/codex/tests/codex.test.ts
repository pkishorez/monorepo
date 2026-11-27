import { describe, expect, it } from '@effect/vitest';
import { Duration, Effect, Fiber, Layer, Stream } from 'effect';
import { TestClock } from 'effect/testing';
import { Codex, CodexError, type Live, type Out } from '../contract/index.ts';
import * as FakeDriver from '../fake/driver.ts';
import * as CodexFake from '../fake/index.ts';
import * as Router from '../shared/index.ts';

const { answers, recordings } = CodexFake;

const text = (value: string) => [
  { type: 'text' as const, text: value, text_elements: [] },
];
const turn = (name: string) => ({ input: text(name) });

const setup = (
  options: {
    linger?: Duration.Input;
    recordings?: Record<string, CodexFake.Recording>;
    refuseSteer?: boolean;
  } = {},
) => {
  const methods: Array<string> = [];
  const counted = Layer.effect(
    Router.Driver,
    Effect.gen(function* () {
      const inner = yield* Router.Driver;
      return Router.Driver.of({
        start: (cwd) =>
          Effect.map(inner.start(cwd), (connection) => ({
            ...connection,
            request: (method, params) => {
              methods.push(method);
              return options.refuseSteer === true && method === 'turn/steer'
                ? Effect.fail(new CodexError({ message: 'no active turn' }))
                : connection.request(method, params);
            },
          })),
      });
    }),
  ).pipe(
    Layer.provide(
      FakeDriver.layer({
        recordings: options.recordings ?? recordings,
        answers,
      }),
    ),
  );
  return {
    layer: Router.layer({ linger: options.linger ?? 0 }).pipe(
      Layer.provide(counted),
    ),
    methods,
  };
};

const startedId = (outs: ReadonlyArray<Out>) => {
  const first = outs[0];
  if (first?._tag !== 'Started') throw new Error('No Started first');
  return first.id;
};

const ended = (outs: ReadonlyArray<Out>) => {
  const last = outs.at(-1);
  if (last?._tag !== 'Ended') throw new Error('No Ended last');
  return last;
};

const until = (id: string, check: (live: Live) => boolean) =>
  Effect.gen(function* () {
    const codex = yield* Codex;
    return yield* codex.watch(id).pipe(Stream.filter(check), Stream.runHead);
  });

const startBlocked = Effect.gen(function* () {
  const codex = yield* Codex;
  const outs: Array<Out> = [];
  const first = yield* codex.create({ turn: turn('approval') }).pipe(
    Stream.runForEach((out) => Effect.sync(() => outs.push(out))),
    Effect.forkChild,
  );
  while (!outs.some((out) => out._tag === 'Requested')) yield* Effect.yieldNow;
  const id = startedId(outs);
  const requested = outs.find((out) => out._tag === 'Requested');
  if (requested?._tag !== 'Requested') throw new Error('No request');
  return { id, outs, first, request: requested.request };
});

const accept = { decision: 'accept' } as const;

const gone = Effect.gen(function* () {
  const codex = yield* Codex;
  while ((yield* codex.live).length > 0) yield* Effect.yieldNow;
});

describe('Codex on the fake driver', () => {
  it.effect(
    'creates a thread: Started first with a fresh id, then records, then Ended',
    () =>
      Effect.gen(function* () {
        const codex = yield* Codex;
        const outs = yield* Stream.runCollect(
          codex.create({ turn: turn('create') }),
        );
        const id = startedId(outs);
        expect(id).not.toBe(recordings['create']?.thread);
        expect(outs.some((out) => out._tag === 'Record')).toBe(true);
        expect(ended(outs)).toMatchObject({
          status: 'completed',
          result: expect.any(String),
        });
      }).pipe(Effect.provide(CodexFake.layer({ linger: 0 }))),
  );

  it.effect('gives structured output as the result', () =>
    Effect.gen(function* () {
      const codex = yield* Codex;
      const outs = yield* Stream.runCollect(
        codex.create({ turn: turn('structured') }),
      );
      expect(JSON.parse(ended(outs).result ?? '')).toEqual({ answer: 'ok' });
    }).pipe(Effect.provide(CodexFake.layer({ linger: 0 }))),
  );

  it.effect('routes send to the live instance', () => {
    const { layer, methods } = setup({ linger: '1 minute' });
    return Effect.gen(function* () {
      const codex = yield* Codex;
      const id = startedId(
        yield* Stream.runCollect(codex.create({ turn: turn('create') })),
      );
      const sent = yield* Stream.runCollect(
        codex.send({ id, turn: turn('create') }),
      );
      expect(startedId(sent)).toBe(id);
      expect(ended(sent).status).toBe('completed');
      expect(methods).not.toContain('thread/resume');
      expect((yield* codex.live).map((live) => live.id)).toEqual([id]);
    }).pipe(Effect.provide(layer));
  });

  it.effect('resumes on send when the thread is not live', () => {
    const { layer, methods } = setup();
    return Effect.gen(function* () {
      const codex = yield* Codex;
      const id = startedId(
        yield* Stream.runCollect(codex.create({ turn: turn('create') })),
      );
      yield* gone;
      const sent = yield* Stream.runCollect(
        codex.send({ id, turn: turn('create') }),
      );
      expect(startedId(sent)).toBe(id);
      expect(ended(sent).status).toBe('completed');
      expect(methods).toContain('thread/resume');
    }).pipe(Effect.provide(layer));
  });

  it.effect('forks a thread into a new one', () =>
    Effect.gen(function* () {
      const codex = yield* Codex;
      const first = yield* Stream.runCollect(
        codex.create({ turn: turn('create') }),
      );
      const id = startedId(first);
      const at = ended(first).at ?? null;
      const forked = yield* Stream.runCollect(
        codex.fork({ id, thread: { lastTurnId: at }, turn: turn('create') }),
      );
      expect(startedId(forked)).not.toBe(id);
      expect(ended(forked).status).toBe('completed');
    }).pipe(Effect.provide(setup().layer)),
  );

  it.effect('queues a send that arrives during a Run, in order', () =>
    Effect.gen(function* () {
      const codex = yield* Codex;
      const { id, first, request } = yield* startBlocked;
      const second = yield* Stream.runCollect(
        codex.send({ id, turn: turn('create') }),
      ).pipe(Effect.forkChild);
      const third = yield* Stream.runCollect(
        codex.send({ id, turn: turn('create') }),
      ).pipe(Effect.forkChild);
      yield* until(id, (live) => live.queue === 2);
      yield* codex.respond(id, request.id, accept);
      yield* Fiber.join(first);
      const [two, three] = [
        yield* Fiber.join(second),
        yield* Fiber.join(third),
      ];
      expect(two.slice(0, 2)).toEqual([
        { _tag: 'Started', id },
        { _tag: 'Queued', position: 1 },
      ]);
      expect(three[1]).toEqual({ _tag: 'Queued', position: 2 });
      expect(ended(two).status).toBe('completed');
      expect(ended(three).status).toBe('completed');
    }).pipe(Effect.provide(setup().layer)),
  );

  it.effect('a steer send joins the Run in progress, echoed as Steered', () => {
    const { layer, methods } = setup();
    return Effect.gen(function* () {
      const codex = yield* Codex;
      const { id, outs, first, request } = yield* startBlocked;
      const steer = yield* Stream.runCollect(
        codex.send({ id, turn: turn('Also say STEERED.'), mode: 'steer' }),
      ).pipe(Effect.forkChild);
      while (!outs.some((out) => out._tag === 'Steered'))
        yield* Effect.yieldNow;
      yield* codex.respond(id, request.id, accept);
      yield* Fiber.join(first);
      const joined = yield* Fiber.join(steer);
      expect(joined).toEqual(outs);
      expect(joined.some((out) => out._tag === 'Queued')).toBe(false);
      const steered = joined.filter((out) => out._tag === 'Steered');
      expect(steered).toHaveLength(1);
      expect(steered[0]).toMatchObject({
        message: {
          params: {
            item: { type: 'userMessage', content: text('Also say STEERED.') },
          },
        },
      });
      expect(ended(joined).status).toBe('completed');
      expect(methods.filter((method) => method === 'turn/start')).toHaveLength(
        1,
      );
    }).pipe(Effect.provide(layer));
  });

  it.effect('a steer send to an idle thread runs as its own Run', () => {
    const { layer, methods } = setup({ linger: '1 minute' });
    return Effect.gen(function* () {
      const codex = yield* Codex;
      const id = startedId(
        yield* Stream.runCollect(codex.create({ turn: turn('create') })),
      );
      const sent = yield* Stream.runCollect(
        codex.send({ id, turn: turn('create'), mode: 'steer' }),
      );
      expect(startedId(sent)).toBe(id);
      expect(sent.some((out) => out._tag === 'Steered')).toBe(false);
      expect(ended(sent).status).toBe('completed');
      expect(methods).not.toContain('turn/steer');
      expect(methods.filter((method) => method === 'turn/start')).toHaveLength(
        2,
      );
    }).pipe(Effect.provide(layer));
  });

  it.effect('a steer send to a thread that is not live resumes it', () => {
    const { layer, methods } = setup();
    return Effect.gen(function* () {
      const codex = yield* Codex;
      const id = startedId(
        yield* Stream.runCollect(codex.create({ turn: turn('create') })),
      );
      yield* gone;
      const sent = yield* Stream.runCollect(
        codex.send({ id, turn: turn('create'), mode: 'steer' }),
      );
      expect(startedId(sent)).toBe(id);
      expect(ended(sent).status).toBe('completed');
      expect(methods).toContain('thread/resume');
      expect(methods).not.toContain('turn/steer');
    }).pipe(Effect.provide(layer));
  });

  it.effect('a steer send skips the queue and joins the current Run', () =>
    Effect.gen(function* () {
      const codex = yield* Codex;
      const { id, outs, first, request } = yield* startBlocked;
      const queued = yield* Stream.runCollect(
        codex.send({ id, turn: turn('create') }),
      ).pipe(Effect.forkChild);
      yield* until(id, (live) => live.queue === 1);
      const steer = yield* Stream.runCollect(
        codex.send({ id, turn: turn('Hurry.'), mode: 'steer' }),
      ).pipe(Effect.forkChild);
      while (!outs.some((out) => out._tag === 'Steered'))
        yield* Effect.yieldNow;
      const [live] = yield* codex.live;
      expect(live?.queue).toBe(1);
      yield* codex.respond(id, request.id, accept);
      yield* Fiber.join(first);
      const joined = yield* Fiber.join(steer);
      const later = yield* Fiber.join(queued);
      expect(joined).toEqual(outs);
      expect(later[1]).toEqual({ _tag: 'Queued', position: 1 });
      expect(later.some((out) => out._tag === 'Steered')).toBe(false);
      expect(ended(later).status).toBe('completed');
    }).pipe(Effect.provide(setup().layer)),
  );

  it.effect('a refused steer falls back to the queue', () =>
    Effect.gen(function* () {
      const codex = yield* Codex;
      const { id, outs, first, request } = yield* startBlocked;
      const steer = yield* Stream.runCollect(
        codex.send({ id, turn: turn('create'), mode: 'steer' }),
      ).pipe(Effect.forkChild);
      yield* until(id, (live) => live.queue === 1);
      yield* codex.respond(id, request.id, accept);
      yield* Fiber.join(first);
      const later = yield* Fiber.join(steer);
      expect(outs.some((out) => out._tag === 'Steered')).toBe(false);
      expect(later.slice(0, 2)).toEqual([
        { _tag: 'Started', id },
        { _tag: 'Queued', position: 1 },
      ]);
      expect(ended(later).status).toBe('completed');
    }).pipe(Effect.provide(setup({ refuseSteer: true }).layer)),
  );

  it.effect('holds a request in Live until respond answers it', () =>
    Effect.gen(function* () {
      const codex = yield* Codex;
      const { id, outs, first, request } = yield* startBlocked;
      const [live] = yield* codex.live;
      expect(live).toMatchObject({
        id,
        status: 'running',
        requests: [request],
      });
      expect(
        yield* Effect.flip(codex.respond(id, 'nope', accept)),
      ).toMatchObject({ _tag: 'CodexError' });
      yield* codex.respond(id, request.id, accept);
      yield* Fiber.join(first);
      expect(ended(outs).status).toBe('completed');
    }).pipe(Effect.provide(setup().layer)),
  );

  it.effect('cancels the Run in progress', () =>
    Effect.gen(function* () {
      const codex = yield* Codex;
      const { id, outs, first } = yield* startBlocked;
      yield* codex.cancel(id);
      yield* Fiber.join(first);
      expect(ended(outs).status).toBe('cancelled');
      expect((yield* codex.live).flatMap((live) => live.requests)).toEqual([]);
    }).pipe(Effect.provide(setup({ linger: '1 minute' }).layer)),
  );

  it.effect('fails NotLive for a thread with no live instance', () =>
    Effect.gen(function* () {
      const codex = yield* Codex;
      expect(
        yield* Effect.flip(codex.respond('none', 1, accept)),
      ).toMatchObject({ _tag: 'NotLive', id: 'none' });
      expect(yield* Effect.flip(codex.cancel('none'))).toMatchObject({
        _tag: 'NotLive',
      });
      expect(
        yield* Effect.flip(
          codex.request('none', 'thread/read', { threadId: 'none' }),
        ),
      ).toMatchObject({ _tag: 'NotLive' });
      expect(yield* Effect.flip(codex.compact('none'))).toMatchObject({
        _tag: 'NotLive',
      });
      expect(yield* Stream.runCollect(codex.watch('none'))).toEqual([]);
    }).pipe(Effect.provide(setup().layer)),
  );

  it.effect('lingers after the last reader, then stops', () =>
    Effect.gen(function* () {
      const codex = yield* Codex;
      const id = startedId(
        yield* Stream.runCollect(codex.create({ turn: turn('create') })),
      );
      yield* TestClock.adjust('29 seconds');
      expect((yield* codex.live).map((live) => live.id)).toEqual([id]);
      yield* TestClock.adjust('2 seconds');
      expect(yield* codex.live).toEqual([]);
    }).pipe(Effect.provide(setup({ linger: '30 seconds' }).layer)),
  );

  it.effect(
    'ends the Run failed when the process dies, drops requests, and resumes on the next send',
    () => {
      const approval = recordings['approval'];
      if (approval === undefined) throw new Error('No approval recording');
      const upTo = approval.messages.findIndex((step) => 'id' in step);
      const dying: CodexFake.Recording = {
        ...approval,
        messages: [...approval.messages.slice(0, upTo + 1), { exit: 'boom' }],
      };
      const { layer, methods } = setup({
        linger: '1 minute',
        recordings: { dying, create: recordings['create']! },
      });
      return Effect.gen(function* () {
        const codex = yield* Codex;
        const outs = yield* Stream.runCollect(
          codex.create({ turn: turn('dying') }),
        );
        const id = startedId(outs);
        expect(outs.some((out) => out._tag === 'Requested')).toBe(true);
        expect(ended(outs)).toMatchObject({
          status: 'failed',
          error: { _tag: 'CodexError', message: 'boom' },
        });
        yield* gone;
        const sent = yield* Stream.runCollect(
          codex.send({ id, turn: turn('create') }),
        );
        expect(ended(sent).status).toBe('completed');
        expect(methods).toContain('thread/resume');
      }).pipe(Effect.provide(layer));
    },
  );

  it.effect('gives a late watch reader the instance as it is now', () =>
    Effect.gen(function* () {
      const codex = yield* Codex;
      const { id, first, request } = yield* startBlocked;
      const now = yield* codex.watch(id).pipe(Stream.runHead);
      expect(now).toMatchObject({
        _tag: 'Some',
        value: { id, status: 'running', requests: [request] },
      });
      yield* codex.respond(id, request.id, accept);
      yield* Fiber.join(first);
      const after = yield* codex.watch(id).pipe(Stream.runHead);
      expect(after).toMatchObject({
        _tag: 'Some',
        value: { status: 'ready', requests: [] },
      });
    }).pipe(Effect.provide(setup({ linger: '1 minute' }).layer)),
  );

  it.effect('gives a slow reader every element of its Run from the start', () =>
    Effect.gen(function* () {
      const codex = yield* Codex;
      const outs = yield* Stream.runCollect(
        codex
          .create({ turn: turn('create') })
          .pipe(Stream.tap(() => Effect.yieldNow)),
      );
      const recorded = recordings['create']?.messages.length ?? 0;
      expect(outs.filter((out) => out._tag === 'Record')).toHaveLength(
        recorded,
      );
      expect(outs[0]?._tag).toBe('Started');
    }).pipe(Effect.provide(setup().layer)),
  );

  it.effect('keeps the Run going when its reader stops reading', () =>
    Effect.gen(function* () {
      const codex = yield* Codex;
      const head = yield* Stream.runCollect(
        codex.create({ turn: turn('approval') }).pipe(Stream.take(1)),
      );
      const id = startedId(head);
      const [blocked] = yield* until(
        id,
        (live) => live.requests.length === 1,
      ).pipe(
        Effect.map((found) => (found._tag === 'Some' ? [found.value] : [])),
      );
      expect(blocked?.status).toBe('running');
      const request = blocked?.requests[0];
      if (request === undefined) throw new Error('No request');
      yield* codex.respond(id, request.id, accept);
      const done = yield* until(id, (live) => live.status === 'ready');
      expect(done._tag).toBe('Some');
    }).pipe(Effect.provide(setup({ linger: '1 minute' }).layer)),
  );

  it.effect('answers harness-specific methods from fixed data', () =>
    Effect.gen(function* () {
      const codex = yield* Codex;
      expect((yield* codex.models()).data.length).toBeGreaterThan(0);
      expect(yield* codex.account()).toEqual(answers['account/read']);
      expect(yield* codex.rateLimits()).toEqual(
        answers['account/rateLimits/read'],
      );
      expect(yield* codex.usage()).toEqual(answers['account/usage/read']);
      expect(yield* codex.threads()).toEqual(answers['thread/list']);
      expect(yield* codex.read({ threadId: 'any' })).toEqual(
        answers['thread/read'],
      );
      expect(yield* codex.skills()).toEqual(answers['skills/list']);
      expect(yield* codex.mcpStatus()).toEqual(answers['mcpServerStatus/list']);
      expect(yield* codex.config()).toEqual(answers['config/read']);
    }).pipe(Effect.provide(CodexFake.layer())),
  );
});
