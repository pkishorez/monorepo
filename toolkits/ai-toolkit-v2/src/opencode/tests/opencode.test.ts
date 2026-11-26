import { describe, expect, it } from '@effect/vitest';
import { Deferred, Effect, Fiber, Stream } from 'effect';
import { TestClock } from 'effect/testing';
import {
  type Live,
  OpenCode,
  type OpenCodeError,
  type Out,
  type SessionID,
} from '../contract/index.js';
import * as OpenCodeFake from '../fake/index.js';

const run = <A, E>(
  body: Effect.Effect<A, E, OpenCode>,
  options: OpenCodeFake.LayerOptions = {},
) => body.pipe(Effect.provide(OpenCodeFake.layer(options)));

const start = (stream: Stream.Stream<Out, OpenCodeError>) =>
  Effect.gen(function* () {
    const started = yield* Deferred.make<SessionID>();
    const fiber = yield* stream.pipe(
      Stream.tap((out) =>
        out._tag === 'Started'
          ? Deferred.succeed(started, out.id)
          : Effect.void,
      ),
      Stream.runCollect,
      Effect.forkChild,
    );
    return { id: yield* Deferred.await(started), fiber };
  });

const steering = (stream: Stream.Stream<Out, OpenCodeError>) =>
  Effect.gen(function* () {
    const steered = yield* Deferred.make<void>();
    const fiber = yield* stream.pipe(
      Stream.tap((out) =>
        out._tag === 'Steered'
          ? Deferred.succeed(steered, undefined)
          : Effect.void,
      ),
      Stream.runCollect,
      Effect.forkChild,
    );
    yield* Deferred.await(steered);
    return fiber;
  });

const until = (id: SessionID, check: (live: Live) => boolean) =>
  Effect.gen(function* () {
    const opencode = yield* OpenCode;
    return yield* opencode.watch(id).pipe(Stream.filter(check), Stream.runHead);
  });

const asked = (id: SessionID) =>
  until(id, (live) => live.requests.length > 0).pipe(
    Effect.map((live) => {
      const request = live._tag === 'Some' ? live.value.requests[0] : undefined;
      if (request?.type !== 'permission.asked') throw new Error('No request');
      return request.data.id;
    }),
  );

const tags = (outs: ReadonlyArray<Out>) => outs.map((out) => out._tag);

const last = (outs: ReadonlyArray<Out>) => outs.at(-1);

const permission = { text: 'permission' };

describe('OpenCode on the fake', () => {
  it.effect('create starts with Started and ends completed', () =>
    run(
      Effect.gen(function* () {
        const opencode = yield* OpenCode;
        const outs = yield* opencode
          .create({ prompt: { text: 'hi' } })
          .pipe(Stream.runCollect);
        const first = outs[0];
        expect(first?._tag).toBe('Started');
        expect(last(outs)).toMatchObject({
          _tag: 'Ended',
          status: 'completed',
        });
        const id = first?._tag === 'Started' ? first.id : undefined;
        const original = OpenCodeFake.recordings['create']?.[0];
        expect(id).not.toBe(
          original?.type === 'session.inbox.enqueued'
            ? original.data.sessionID
            : undefined,
        );
        for (const out of outs) {
          if (out._tag === 'Record' && 'sessionID' in out.record.data) {
            expect(out.record.data.sessionID).toBe(id);
          }
        }
      }),
    ),
  );

  it.effect('send is routed to the live instance', () =>
    run(
      Effect.gen(function* () {
        const opencode = yield* OpenCode;
        const created = yield* opencode
          .create({ prompt: { text: 'create' } })
          .pipe(Stream.runCollect);
        const id = created[0]?._tag === 'Started' ? created[0].id : undefined;
        if (id === undefined) throw new Error('No id');
        expect((yield* opencode.live).map((live) => live.id)).toEqual([id]);
        const sent = yield* opencode
          .send({ sessionID: id, prompt: { text: 'send' } })
          .pipe(Stream.runCollect);
        expect(sent[0]).toMatchObject({ _tag: 'Started', id });
        expect(last(sent)).toMatchObject({ status: 'completed' });
        expect(yield* opencode.live).toHaveLength(1);
      }),
    ),
  );

  it.effect('send resumes a session that is not live', () =>
    run(
      Effect.gen(function* () {
        const opencode = yield* OpenCode;
        const created = yield* opencode
          .create({ prompt: { text: 'create' } })
          .pipe(Stream.runCollect);
        const id = created[0]?._tag === 'Started' ? created[0].id : undefined;
        if (id === undefined) throw new Error('No id');
        yield* TestClock.adjust('31 seconds');
        expect(yield* opencode.live).toEqual([]);
        const sent = yield* opencode
          .send({ sessionID: id, prompt: { text: 'send' } })
          .pipe(Stream.runCollect);
        expect(tags(sent)[0]).toBe('Started');
        expect(last(sent)).toMatchObject({ status: 'completed' });
      }),
    ),
  );

  it.effect('send during a Run queues in order', () =>
    run(
      Effect.gen(function* () {
        const opencode = yield* OpenCode;
        const first = yield* start(opencode.create({ prompt: permission }));
        const request = yield* asked(first.id);
        const second = yield* start(
          opencode.send({ sessionID: first.id, prompt: { text: 'send' } }),
        );
        const third = yield* start(
          opencode.send({ sessionID: first.id, prompt: { text: 'send' } }),
        );
        expect((yield* opencode.live)[0]?.queue).toBe(2);
        yield* opencode.respond(first.id, request, { decision: 'once' });
        const outs = yield* Fiber.join(first.fiber);
        const next = yield* Fiber.join(second.fiber);
        const after = yield* Fiber.join(third.fiber);
        expect(last(outs)).toMatchObject({ status: 'completed' });
        expect(tags(next).slice(0, 2)).toEqual(['Started', 'Queued']);
        expect(next[1]).toMatchObject({ position: 1 });
        expect(after[1]).toMatchObject({ _tag: 'Queued', position: 2 });
        expect(last(next)).toMatchObject({ status: 'completed' });
        expect(last(after)).toMatchObject({ status: 'completed' });
      }),
    ),
  );

  it.effect('respond answers a pending permission', () =>
    run(
      Effect.gen(function* () {
        const opencode = yield* OpenCode;
        const { id, fiber } = yield* start(
          opencode.create({ prompt: permission }),
        );
        const request = yield* asked(id);
        yield* opencode.respond(id, request, { decision: 'once' });
        const outs = yield* Fiber.join(fiber);
        expect(tags(outs)).toContain('Requested');
        expect(
          outs.some(
            (out) =>
              out._tag === 'Record' && out.record.type === 'permission.replied',
          ),
        ).toBe(true);
        expect(last(outs)).toMatchObject({ status: 'completed' });
        expect((yield* opencode.live)[0]?.requests).toEqual([]);
      }),
    ),
  );

  it.effect('a steer joins the Run in progress and streams it', () =>
    run(
      Effect.gen(function* () {
        const opencode = yield* OpenCode;
        const { id, fiber } = yield* start(
          opencode.create({ prompt: permission }),
        );
        const request = yield* asked(id);
        const steer = yield* steering(
          opencode.send({
            sessionID: id,
            prompt: { text: 'also this' },
            mode: 'steer',
          }),
        );
        yield* opencode.respond(id, request, { decision: 'once' });
        const outs = yield* Fiber.join(fiber);
        const steered = outs.find((out) => out._tag === 'Steered');
        expect(steered).toMatchObject({
          message: { payload: { text: 'also this' } },
        });
        expect(last(outs)).toMatchObject({ status: 'completed' });
        expect(yield* Fiber.join(steer)).toEqual(outs);
      }),
    ),
  );

  it.effect('a steer when idle runs as its own Run', () =>
    run(
      Effect.gen(function* () {
        const opencode = yield* OpenCode;
        const created = yield* opencode
          .create({ prompt: { text: 'create' } })
          .pipe(Stream.runCollect);
        const id = created[0]?._tag === 'Started' ? created[0].id : undefined;
        if (id === undefined) throw new Error('No id');
        const sent = yield* opencode
          .send({ sessionID: id, prompt: { text: 'send' }, mode: 'steer' })
          .pipe(Stream.runCollect);
        expect(sent[0]).toMatchObject({ _tag: 'Started', id });
        expect(tags(sent)).not.toContain('Queued');
        expect(tags(sent)).not.toContain('Steered');
        expect(last(sent)).toMatchObject({ status: 'completed' });
      }),
    ),
  );

  it.effect('a steer to a session that is not live resumes it', () =>
    run(
      Effect.gen(function* () {
        const opencode = yield* OpenCode;
        const created = yield* opencode
          .create({ prompt: { text: 'create' } })
          .pipe(Stream.runCollect);
        const id = created[0]?._tag === 'Started' ? created[0].id : undefined;
        if (id === undefined) throw new Error('No id');
        yield* TestClock.adjust('31 seconds');
        expect(yield* opencode.live).toEqual([]);
        const sent = yield* opencode
          .send({ sessionID: id, prompt: { text: 'send' }, mode: 'steer' })
          .pipe(Stream.runCollect);
        expect(tags(sent)[0]).toBe('Started');
        expect(last(sent)).toMatchObject({ status: 'completed' });
      }),
    ),
  );

  it.effect('a steer skips a queued send and joins the current Run', () =>
    run(
      Effect.gen(function* () {
        const opencode = yield* OpenCode;
        const first = yield* start(opencode.create({ prompt: permission }));
        const request = yield* asked(first.id);
        const queued = yield* start(
          opencode.send({ sessionID: first.id, prompt: { text: 'send' } }),
        );
        const steer = yield* steering(
          opencode.send({
            sessionID: first.id,
            prompt: { text: 'also this' },
            mode: 'steer',
          }),
        );
        expect((yield* opencode.live)[0]?.queue).toBe(1);
        yield* opencode.respond(first.id, request, { decision: 'once' });
        const outs = yield* Fiber.join(first.fiber);
        const steered = yield* Fiber.join(steer);
        const after = yield* Fiber.join(queued.fiber);
        expect(steered).toEqual(outs);
        expect(tags(steered)).toContain('Steered');
        expect(tags(steered)).not.toContain('Queued');
        expect(after[1]).toMatchObject({ _tag: 'Queued', position: 1 });
        expect(tags(after)).not.toContain('Steered');
        expect(last(after)).toMatchObject({ status: 'completed' });
      }),
    ),
  );

  it.effect('cancel stops the Run in progress', () =>
    run(
      Effect.gen(function* () {
        const opencode = yield* OpenCode;
        const { id, fiber } = yield* start(
          opencode.create({ prompt: permission }),
        );
        yield* asked(id);
        yield* opencode.cancel(id);
        const outs = yield* Fiber.join(fiber);
        expect(last(outs)).toMatchObject({ status: 'cancelled' });
        expect((yield* opencode.live)[0]?.requests).toEqual([]);
      }),
    ),
  );

  it.effect('respond and cancel fail NotLive without an instance', () =>
    run(
      Effect.gen(function* () {
        const opencode = yield* OpenCode;
        const id = 'ses_none' as SessionID;
        const errors = yield* Effect.all([
          Effect.flip(opencode.respond(id, 'per_none', { decision: 'once' })),
          Effect.flip(opencode.cancel(id)),
        ]);
        expect(errors.map((error) => error._tag)).toEqual([
          'NotLive',
          'NotLive',
        ]);
      }),
    ),
  );

  it.effect('an instance lingers after its last reader, then goes', () =>
    run(
      Effect.gen(function* () {
        const opencode = yield* OpenCode;
        yield* opencode
          .create({ prompt: { text: 'create' } })
          .pipe(Stream.runDrain);
        yield* TestClock.adjust('5 seconds');
        expect(yield* opencode.live).toHaveLength(1);
        yield* TestClock.adjust('6 seconds');
        expect(yield* opencode.live).toEqual([]);
      }),
      { linger: '10 seconds' },
    ),
  );

  it.effect('a failure mid-Run ends it failed and the next send resumes', () =>
    run(
      Effect.gen(function* () {
        const opencode = yield* OpenCode;
        const crashed = yield* start(
          opencode.create({ prompt: { text: 'crash' } }),
        );
        const watched = yield* opencode
          .watch(crashed.id)
          .pipe(Stream.runCollect, Effect.forkChild);
        const outs = yield* Fiber.join(crashed.fiber);
        expect(last(outs)).toMatchObject({ _tag: 'Ended', status: 'failed' });
        yield* Fiber.join(watched);
        expect(yield* opencode.live).toEqual([]);
        const resumed = yield* opencode
          .send({ sessionID: crashed.id, prompt: { text: 'create' } })
          .pipe(Stream.runCollect);
        expect(last(resumed)).toMatchObject({ status: 'completed' });
      }),
      {
        recordings: {
          crash: (OpenCodeFake.recordings['create'] ?? []).slice(0, 5),
          create: OpenCodeFake.recordings['create'] ?? [],
        },
      },
    ),
  );

  it.effect('a late watch reader sees the instance as it is now', () =>
    run(
      Effect.gen(function* () {
        const opencode = yield* OpenCode;
        const { id, fiber } = yield* start(
          opencode.create({ prompt: permission }),
        );
        const request = yield* asked(id);
        const now = yield* opencode.watch(id).pipe(Stream.runHead);
        expect(now._tag === 'Some' ? now.value : undefined).toMatchObject({
          id,
          status: 'running',
          queue: 0,
        });
        yield* opencode.respond(id, request, { decision: 'once' });
        yield* Fiber.join(fiber);
      }),
    ),
  );

  it.effect('a Run reader gets every element however late it reads', () =>
    run(
      Effect.gen(function* () {
        const opencode = yield* OpenCode;
        const latch = yield* Deferred.make<void>();
        const { id, fiber } = yield* start(
          opencode
            .create({ prompt: { text: 'create' } })
            .pipe(
              Stream.tap((out) =>
                out._tag === 'Started' ? Effect.void : Deferred.await(latch),
              ),
            ),
        );
        yield* until(id, (live) => live.status === 'ready');
        yield* Deferred.succeed(latch, undefined);
        const outs = yield* Fiber.join(fiber);
        expect(outs).toHaveLength(
          (OpenCodeFake.recordings['create']?.length ?? 0) + 2,
        );
      }),
    ),
  );

  it.effect('a reader that stops reading does not cancel the Run', () =>
    run(
      Effect.gen(function* () {
        const opencode = yield* OpenCode;
        const head = yield* opencode
          .create({ prompt: permission })
          .pipe(Stream.take(1), Stream.runCollect);
        const id = head[0]?._tag === 'Started' ? head[0].id : undefined;
        if (id === undefined) throw new Error('No id');
        const request = yield* asked(id);
        yield* opencode.respond(id, request, { decision: 'once' });
        const ready = yield* until(id, (live) => live.status === 'ready');
        expect(ready._tag).toBe('Some');
      }),
    ),
  );

  it.effect('harness-specific methods answer from fixed data', () =>
    run(
      Effect.gen(function* () {
        const opencode = yield* OpenCode;
        expect(yield* opencode.providers()).toMatchObject({
          data: expect.any(Array),
        });
        expect(yield* opencode.models()).toEqual({ data: [] });
        const error = yield* Effect.flip(opencode.client);
        expect(error._tag).toBe('OpenCodeError');
      }),
      { methods: { providers: { data: [] }, models: { data: [] } } },
    ),
  );
});
