import { describe, expect, it } from '@effect/vitest';
import { Effect, Fiber, Stream } from 'effect';
import { TestClock } from 'effect/testing';
import { Claude, ClaudeError, NotLive, type Live } from '../contract/index.js';
import * as ClaudeFake from '../fake/index.js';
import { Out } from '../shared/index.js';

const cwd = '/tmp/claude-fake';

const recording = (name: string): ClaudeFake.Recording => {
  const found = ClaudeFake.recordings.find((one) => one.name === name);
  if (found === undefined) throw new Error(`No recording ${name}`);
  return found;
};

const collect = (stream: Stream.Stream<Out, ClaudeError>) =>
  Effect.map(Stream.runCollect(stream), (outs) => [...outs]);

const ended = (outs: ReadonlyArray<Out>) => {
  const last = outs.at(-1);
  if (last?._tag !== 'Ended') throw new Error('No Ended last');
  return last;
};

const idOf = (outs: ReadonlyArray<Out>): string => {
  const first = outs[0];
  if (first?._tag !== 'Started') throw new Error('No Started first');
  return first.id;
};

const tags = (outs: ReadonlyArray<Out>) =>
  outs.map((out) => out._tag).filter((tag) => tag !== 'Record');

const until = (id: string, test: (live: Live) => boolean) =>
  Effect.gen(function* () {
    const claude = yield* Claude;
    return yield* claude.watch(id).pipe(Stream.filter(test), Stream.runHead);
  });

const startedId = (stream: Stream.Stream<Out, ClaudeError>) =>
  Effect.gen(function* () {
    const outs: Array<Out> = [];
    const fiber = yield* stream.pipe(
      Stream.runForEach((out) => Effect.sync(() => outs.push(out))),
      Effect.forkChild,
    );
    while (outs[0]?._tag !== 'Started') yield* Effect.yieldNow;
    return { id: idOf(outs), outs, fiber };
  });

const pausedAtRequest = Effect.gen(function* () {
  const claude = yield* Claude;
  const run = yield* startedId(claude.create({ cwd, prompt: 'permission' }));
  yield* until(run.id, (live) => live.requests.length === 1);
  return run;
});

const requestIdOf = (live: ReadonlyArray<Live>) =>
  live[0]?.requests[0]?.options.requestId ?? '';

const allow = (id: string) =>
  Effect.gen(function* () {
    const claude = yield* Claude;
    const live = yield* claude.live;
    const request = live[0]?.requests[0];
    yield* claude.respond(id, requestIdOf(live), {
      behavior: 'allow',
      updatedInput: request?.input ?? {},
    });
  });

const fake = (options?: ClaudeFake.FakeOptions) =>
  Effect.provide(ClaudeFake.layer(options));

describe('Claude on the fake driver', () => {
  it.effect('create gives Started first, the records, then Ended', () =>
    Effect.gen(function* () {
      const claude = yield* Claude;
      const outs = yield* collect(claude.create({ cwd, prompt: 'create' }));
      const id = idOf(outs);
      const records = outs.flatMap((out) =>
        out._tag === 'Record' ? [out.record] : [],
      );
      expect(tags(outs)).toEqual(['Started', 'Ended']);
      expect(records).toHaveLength(recording('create').entries.length);
      expect(records.every((record) => record.session_id === id)).toBe(true);
      expect(ended(outs).status).toBe('completed');
      expect(ended(outs).result?.subtype).toBe('success');
      expect(ended(outs).at).toBeDefined();
    }).pipe(fake()),
  );

  it.effect('send goes to the live instance', () =>
    Effect.gen(function* () {
      const claude = yield* Claude;
      const id = idOf(yield* collect(claude.create({ cwd, prompt: 'create' })));
      const watching = yield* claude
        .watch(id)
        .pipe(Stream.runCollect, Effect.forkChild);
      const outs = yield* collect(claude.send({ id, cwd, prompt: 'send' }));
      expect(outs[0]).toEqual(Out.Started({ id }));
      expect(ended(outs).status).toBe('completed');
      expect((yield* claude.live).map((live) => live.id)).toEqual([id]);
      expect(watching.pollUnsafe()).toBeUndefined();
    }).pipe(fake()),
  );

  it.effect('send resumes a session that is not live', () =>
    Effect.gen(function* () {
      const claude = yield* Claude;
      const id = crypto.randomUUID();
      expect(yield* claude.live).toEqual([]);
      const outs = yield* collect(claude.send({ id, cwd, prompt: 'send' }));
      expect(outs[0]).toEqual(Out.Started({ id }));
      expect(ended(outs).status).toBe('completed');
      expect((yield* claude.live).map((live) => live.id)).toEqual([id]);
    }).pipe(fake()),
  );

  it.effect('fork starts a new session', () =>
    Effect.gen(function* () {
      const claude = yield* Claude;
      const first = yield* collect(claude.create({ cwd, prompt: 'create' }));
      const outs = yield* collect(
        claude.fork({
          id: idOf(first),
          at: ended(first).at ?? '',
          cwd,
          prompt: 'fork',
        }),
      );
      expect(idOf(outs)).not.toBe(idOf(first));
      expect(ended(outs).status).toBe('completed');
    }).pipe(fake()),
  );

  it.effect('a send during a Run is queued and runs after it', () =>
    Effect.gen(function* () {
      const claude = yield* Claude;
      const first = yield* pausedAtRequest;
      const second = yield* claude
        .send({ id: first.id, cwd, prompt: 'send' })
        .pipe(collect, Effect.forkChild);
      yield* until(first.id, (live) => live.queue === 1);
      yield* allow(first.id);
      yield* Fiber.join(first.fiber);
      const outs = yield* Fiber.join(second);
      expect(tags(first.outs)).toEqual(['Started', 'Requested', 'Ended']);
      expect(tags(outs)).toEqual(['Started', 'Queued', 'Ended']);
      expect(outs[1]).toEqual(Out.Queued({ position: 1 }));
      expect(ended(outs).status).toBe('completed');
    }).pipe(fake()),
  );

  it.effect('a steer joins the Run in progress and is echoed as Steered', () =>
    Effect.gen(function* () {
      const claude = yield* Claude;
      const run = yield* pausedAtRequest;
      const steer = yield* startedId(
        claude.send({ id: run.id, cwd, prompt: 'also this', mode: 'steer' }),
      );
      yield* allow(run.id);
      yield* Fiber.join(run.fiber);
      yield* Fiber.join(steer.fiber);
      const steered = run.outs.find((out) => out._tag === 'Steered');
      expect(steered?._tag === 'Steered' && steered.message.isReplay).toBe(
        true,
      );
      expect(steer.outs).toEqual(run.outs);
      expect(ended(run.outs).result?.user_message_uuids).toHaveLength(2);
      expect(ended(run.outs).status).toBe('completed');
    }).pipe(fake()),
  );

  it.effect('a steer with no Run in progress runs as its own Run', () =>
    Effect.gen(function* () {
      const claude = yield* Claude;
      const id = idOf(yield* collect(claude.create({ cwd, prompt: 'create' })));
      const outs = yield* collect(
        claude.send({ id, cwd, prompt: 'send', mode: 'steer' }),
      );
      expect(tags(outs)).toEqual(['Started', 'Ended']);
      expect(ended(outs).status).toBe('completed');
    }).pipe(fake()),
  );

  it.effect('a steer to a session that is not live resumes it', () =>
    Effect.gen(function* () {
      const claude = yield* Claude;
      const id = crypto.randomUUID();
      const outs = yield* collect(
        claude.send({ id, cwd, prompt: 'send', mode: 'steer' }),
      );
      expect(outs[0]).toEqual(Out.Started({ id }));
      expect(ended(outs).status).toBe('completed');
      expect((yield* claude.live).map((live) => live.id)).toEqual([id]);
    }).pipe(fake()),
  );

  it.effect('a steer joins the Run in progress ahead of a queued send', () =>
    Effect.gen(function* () {
      const claude = yield* Claude;
      const run = yield* pausedAtRequest;
      const queued = yield* claude
        .send({ id: run.id, cwd, prompt: 'send' })
        .pipe(collect, Effect.forkChild);
      yield* until(run.id, (live) => live.queue === 1);
      const steer = yield* startedId(
        claude.send({ id: run.id, cwd, prompt: 'also this', mode: 'steer' }),
      );
      expect((yield* claude.live)[0]?.queue).toBe(1);
      yield* allow(run.id);
      yield* Fiber.join(steer.fiber);
      const later = yield* Fiber.join(queued);
      expect(tags(steer.outs)).toEqual([
        'Started',
        'Requested',
        'Steered',
        'Ended',
      ]);
      expect(steer.outs).toEqual(run.outs);
      expect(tags(later)).toEqual(['Started', 'Queued', 'Ended']);
    }).pipe(fake()),
  );

  it.effect('respond answers a pending request once', () =>
    Effect.gen(function* () {
      const claude = yield* Claude;
      const run = yield* pausedAtRequest;
      const live = yield* claude.live;
      expect(live[0]?.requests[0]?.toolName).toBe('Write');
      yield* allow(run.id);
      yield* Fiber.join(run.fiber);
      const again = yield* Effect.flip(
        claude.respond(run.id, requestIdOf(live), { behavior: 'allow' }),
      );
      expect(again).toBeInstanceOf(ClaudeError);
      expect(ended(run.outs).status).toBe('completed');
    }).pipe(fake()),
  );

  it.effect('cancel ends the Run cancelled and drops its request', () =>
    Effect.gen(function* () {
      const claude = yield* Claude;
      const run = yield* pausedAtRequest;
      yield* claude.cancel(run.id);
      yield* Fiber.join(run.fiber);
      expect(ended(run.outs).status).toBe('cancelled');
      const live = yield* claude.live;
      expect(live[0]?.status).toBe('ready');
      expect(live[0]?.requests).toEqual([]);
    }).pipe(fake()),
  );

  it.effect('respond, cancel and live methods fail NotLive', () =>
    Effect.gen(function* () {
      const claude = yield* Claude;
      const id = crypto.randomUUID();
      const failures = yield* Effect.all([
        Effect.flip(claude.respond(id, 'r', { behavior: 'allow' })),
        Effect.flip(claude.cancel(id)),
        Effect.flip(claude.contextUsage(id)),
        Effect.flip(claude.setModel(id, 'haiku')),
      ]);
      expect(failures).toEqual(failures.map(() => new NotLive({ id })));
    }).pipe(fake()),
  );

  it.effect('an instance lingers after its last Run, then stops', () =>
    Effect.gen(function* () {
      const claude = yield* Claude;
      yield* collect(claude.create({ cwd, prompt: 'create' }));
      yield* TestClock.adjust('29 seconds');
      expect(yield* claude.live).toHaveLength(1);
      yield* TestClock.adjust('2 seconds');
      expect(yield* claude.live).toEqual([]);
    }).pipe(fake()),
  );

  it.effect('a watch reader holds the instance', () =>
    Effect.gen(function* () {
      const claude = yield* Claude;
      const id = idOf(yield* collect(claude.create({ cwd, prompt: 'create' })));
      const watching = yield* claude
        .watch(id)
        .pipe(Stream.runDrain, Effect.forkChild);
      yield* Effect.yieldNow;
      yield* TestClock.adjust('1 minute');
      expect(yield* claude.live).toHaveLength(1);
      yield* Fiber.interrupt(watching);
      yield* TestClock.adjust('1 minute');
      expect(yield* claude.live).toEqual([]);
    }).pipe(fake({ linger: '5 seconds' })),
  );

  it.effect('a late watch reader gets the instance as it is now', () =>
    Effect.gen(function* () {
      const claude = yield* Claude;
      const run = yield* pausedAtRequest;
      const first = yield* claude.watch(run.id).pipe(Stream.runHead);
      expect(first._tag === 'Some' && first.value.status).toBe('running');
      expect(first._tag === 'Some' && first.value.requests).toHaveLength(1);
      expect(first._tag === 'Some' && first.value.model).toBeDefined();
    }).pipe(fake()),
  );

  it.effect('a reader that stops reading does not cancel its Run', () =>
    Effect.gen(function* () {
      const claude = yield* Claude;
      const outs = yield* collect(
        claude
          .create({ cwd, prompt: 'permission' })
          .pipe(Stream.takeUntil((out) => out._tag === 'Requested')),
      );
      const id = idOf(outs);
      yield* allow(id);
      yield* until(id, (live) => live.status === 'ready');
      const next = yield* collect(claude.send({ id, cwd, prompt: 'send' }));
      expect(tags(next)).toEqual(['Started', 'Ended']);
      expect(ended(next).status).toBe('completed');
    }).pipe(fake()),
  );

  it.effect('the process dying mid-Run ends it failed, and send resumes', () =>
    Effect.gen(function* () {
      const claude = yield* Claude;
      const outs = yield* collect(claude.create({ cwd, prompt: 'dies' }));
      const id = idOf(outs);
      expect(ended(outs)).toMatchObject({ status: 'failed', error: 'killed' });
      yield* Effect.yieldNow;
      expect(yield* claude.live).toEqual([]);
      const next = yield* collect(claude.send({ id, cwd, prompt: 'create' }));
      expect(ended(next).status).toBe('completed');
    }).pipe(
      fake({
        recordings: [
          {
            name: 'dies',
            entries: [
              ...recording('create').entries.slice(0, 3),
              { exit: 'killed' },
            ],
          },
          recording('create'),
        ],
      }),
    ),
  );

  it.effect('harness-specific methods answer from fixed data', () =>
    Effect.gen(function* () {
      const claude = yield* Claude;
      const initialization = yield* claude.initialization({ cwd });
      expect(initialization.models.length).toBeGreaterThan(0);
      const id = idOf(yield* collect(claude.create({ cwd, prompt: 'create' })));
      expect((yield* claude.contextUsage(id)).totalTokens).toBeGreaterThan(0);
      expect(yield* claude.mcpServerStatus(id)).toEqual([]);
      expect(yield* claude.listSessions()).toEqual([]);
    }).pipe(fake()),
  );
});
