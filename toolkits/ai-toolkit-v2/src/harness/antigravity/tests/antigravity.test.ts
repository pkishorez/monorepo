import type {
  ContentBlock,
  SessionConfigOption,
} from '@agentclientprotocol/sdk/unstable';
import { describe, expect, it } from '@effect/vitest';
import { Effect, Fiber, Stream } from 'effect';
import { Antigravity, type Live, type Out } from '../contract/index.ts';
import { layer as antigravityFakeLayer, recordings } from '../fake/index.ts';
const base = recordings['create'] ?? {
  steps: [],
  response: { stopReason: 'end_turn' },
};

const layer = antigravityFakeLayer({
  linger: '100 millis',
  pace: '5 millis',
  recordings: {
    ...recordings,
    dies: { ...base, steps: [...base.steps.slice(0, 1), { exit: true }] },
    wake: {
      ...base,
      after: [
        {
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text: 'woke' },
        },
      ],
    },
  },
});

const cwd = '/tmp';
const text = (value: string): Array<ContentBlock> => [
  { type: 'text', text: value },
];

const tags = (outs: ReadonlyArray<Out>) => outs.map((out) => out._tag);
const ended = (outs: ReadonlyArray<Out>) => {
  const last = outs.at(-1);
  return last?._tag === 'Ended' ? last : undefined;
};
const idOf = (outs: ReadonlyArray<Out>) => {
  const first = outs[0];
  return first?._tag === 'Started' ? first.id : '';
};

const collect = <R>(
  stream: Stream.Stream<Out, unknown, R>,
  onOut: (out: Out) => Effect.Effect<void, unknown> = () => Effect.void,
) =>
  stream.pipe(
    Stream.tap((out) => onOut(out).pipe(Effect.orDie)),
    Stream.runCollect,
    Effect.map((all) => [...all]),
  );

const created = Effect.gen(function* () {
  const service = yield* Antigravity;
  return yield* collect(
    service.create({ session: { cwd, mcpServers: [] }, prompt: text('hi') }),
  );
});

const send = (
  id: string,
  prompt: string,
  onOut?: (out: Out) => Effect.Effect<void, unknown>,
) =>
  Effect.gen(function* () {
    const service = yield* Antigravity;
    return yield* collect(
      service.send({ session: { sessionId: id, cwd }, prompt: text(prompt) }),
      onOut,
    );
  });

const steer = (id: string, prompt: string) =>
  Stream.unwrap(
    Effect.gen(function* () {
      const service = yield* Antigravity;
      return service.send({
        session: { sessionId: id, cwd },
        prompt: text(prompt),
        mode: 'steer',
      });
    }),
  );

const untilSteered = (id: string, prompt: string) =>
  collect(
    steer(id, prompt).pipe(Stream.takeUntil((out) => out._tag === 'Steered')),
  );

const allow = (id: string, live: Live | undefined) =>
  Effect.gen(function* () {
    const service = yield* Antigravity;
    const request = live?.requests[0];
    if (request === undefined) return yield* Effect.die('no request');
    yield* service.respond(id, request.id, {
      outcome: { outcome: 'selected', optionId: 'allow' },
    });
  });

const said = (outs: ReadonlyArray<Out>) =>
  outs
    .flatMap((out) =>
      out._tag === 'Record' &&
      out.record.update.sessionUpdate === 'agent_message_chunk' &&
      out.record.update.content.type === 'text'
        ? [out.record.update.content.text]
        : [],
    )
    .join('');

const waitFor = (id: string, until: (live: Live) => boolean) =>
  Effect.gen(function* () {
    const service = yield* Antigravity;
    return yield* service.watch(id).pipe(Stream.filter(until), Stream.runHead);
  });

const failsWith = <A, E>(effect: Effect.Effect<A, E>) =>
  effect.pipe(
    Effect.flip,
    Effect.map((error) => (error as { _tag: string })._tag),
  );

describe('Antigravity on the fake agy', () => {
  it.live('create opens a session and ends its first Run', () =>
    Effect.gen(function* () {
      const service = yield* Antigravity;
      const outs = yield* created;
      const id = idOf(outs);
      expect(id).toMatch(/^[0-9a-f-]{36}$/);
      expect(tags(outs).filter((tag) => tag === 'Ended')).toEqual(['Ended']);
      expect(ended(outs)?.status).toBe('completed');
      expect(ended(outs)?.result?.stopReason).toBe('end_turn');
      const [live] = yield* service.live;
      expect(live?.id).toBe(id);
      expect(live?.status).toBe('ready');
      expect(live?.commands.length).toBeGreaterThan(0);
      expect(live?.initialize.agentInfo?.name).toContain('Antigravity');
    }).pipe(Effect.provide(layer)),
  );

  it.live('send goes to the live instance', () =>
    Effect.gen(function* () {
      const service = yield* Antigravity;
      const id = idOf(yield* created);
      const before = yield* service.connection(id);
      const outs = yield* send(id, 'send');
      expect(idOf(outs)).toBe(id);
      expect(ended(outs)?.status).toBe('completed');
      expect(yield* service.connection(id)).toBe(before);
      expect((yield* service.live).length).toBe(1);
    }).pipe(Effect.provide(layer)),
  );

  it.live('send resumes a session that is not live', () =>
    Effect.gen(function* () {
      const service = yield* Antigravity;
      const id = '11111111-2222-3333-4444-555555555555';
      const outs = yield* send(id, 'resumed');
      expect(idOf(outs)).toBe(id);
      expect(ended(outs)?.status).toBe('completed');
      expect((yield* service.live).map((live) => live.id)).toEqual([id]);
    }).pipe(Effect.provide(layer)),
  );

  it.live('a send during a Run queues, in order', () =>
    Effect.gen(function* () {
      const id = idOf(yield* created);
      const first = yield* send(id, 'send').pipe(Effect.forkChild);
      yield* waitFor(id, (live) => live.status === 'running');
      const second = yield* send(id, 'send').pipe(Effect.forkChild);
      yield* waitFor(id, (live) => live.queue === 1);
      const third = yield* send(id, 'send');
      const a = yield* Fiber.join(first);
      const b = yield* Fiber.join(second);
      expect(tags(a)).not.toContain('Queued');
      expect(b[1]).toMatchObject({ _tag: 'Queued', position: 1 });
      expect(third[1]).toMatchObject({ _tag: 'Queued', position: 2 });
      expect([a, b, third].map((outs) => ended(outs)?.status)).toEqual([
        'completed',
        'completed',
        'completed',
      ]);
    }).pipe(Effect.provide(layer)),
  );

  it.live(
    'a steer joins the Run, and the replaced prompt does not end it',
    () =>
      Effect.gen(function* () {
        const id = idOf(yield* created);
        const first = yield* send(id, 'steer').pipe(Effect.forkChild);
        const live = yield* waitFor(id, (now) => now.requests.length > 0);
        const head = yield* untilSteered(id, 'steered');
        yield* allow(id, live._tag === 'Some' ? live.value : undefined);
        const outs = yield* Fiber.join(first);
        expect(tags(head)).toEqual(tags(outs).slice(0, head.length));
        expect(idOf(head)).toBe(id);
        const at = outs.findIndex((out) => out._tag === 'Steered');
        expect(outs[at]).toMatchObject({ message: text('steered') });
        expect(tags(outs).filter((tag) => tag === 'Ended')).toEqual(['Ended']);
        expect(ended(outs)?.status).toBe('completed');
        expect(said(outs.slice(at))).toContain('steered');
      }).pipe(Effect.provide(layer)),
  );

  it.live('a steer on an idle session runs as its own Run', () =>
    Effect.gen(function* () {
      const id = idOf(yield* created);
      const outs = yield* collect(steer(id, 'send'));
      expect(idOf(outs)).toBe(id);
      expect(tags(outs)).not.toContain('Steered');
      expect(tags(outs)).not.toContain('Queued');
      expect(ended(outs)?.status).toBe('completed');
    }).pipe(Effect.provide(layer)),
  );

  it.live('a steer on a session that is not live resumes it', () =>
    Effect.gen(function* () {
      const service = yield* Antigravity;
      const id = '11111111-2222-3333-4444-666666666666';
      const outs = yield* collect(steer(id, 'resumed'));
      expect(idOf(outs)).toBe(id);
      expect(ended(outs)?.status).toBe('completed');
      expect((yield* service.live).map((live) => live.id)).toEqual([id]);
    }).pipe(Effect.provide(layer)),
  );

  it.live('a steer joins the Run in progress ahead of a queued send', () =>
    Effect.gen(function* () {
      const id = idOf(yield* created);
      const first = yield* send(id, 'steer').pipe(Effect.forkChild);
      const live = yield* waitFor(id, (now) => now.requests.length > 0);
      const queued = yield* send(id, 'send').pipe(Effect.forkChild);
      yield* waitFor(id, (now) => now.queue === 1);
      const head = yield* untilSteered(id, 'steered');
      expect(tags(head)).not.toContain('Queued');
      yield* allow(id, live._tag === 'Some' ? live.value : undefined);
      const a = yield* Fiber.join(first);
      const b = yield* Fiber.join(queued);
      expect(tags(a)).toContain('Steered');
      expect(b[1]).toMatchObject({ _tag: 'Queued', position: 1 });
      expect(tags(b)).not.toContain('Steered');
      expect(ended(b)?.status).toBe('completed');
    }).pipe(Effect.provide(layer)),
  );

  it.live('respond answers a permission request', () =>
    Effect.gen(function* () {
      const service = yield* Antigravity;
      const id = idOf(yield* created);
      const seen: Array<number> = [];
      const outs = yield* send(id, 'permission', (out) =>
        out._tag === 'Requested'
          ? Effect.gen(function* () {
              const [live] = yield* service.live;
              seen.push(live?.requests.length ?? 0);
              yield* service.respond(id, out.request.id, {
                outcome: { outcome: 'selected', optionId: 'allow' },
              });
            })
          : Effect.void,
      );
      const requested = outs.find((out) => out._tag === 'Requested');
      expect(requested?._tag === 'Requested' && requested.request.method).toBe(
        'session/request_permission',
      );
      expect(seen).toEqual([1]);
      expect(ended(outs)?.status).toBe('completed');
      expect((yield* service.live)[0]?.requests).toEqual([]);
      const unknown = yield* failsWith(
        service.respond(id, 999, { outcome: { outcome: 'cancelled' } }),
      );
      expect(unknown).toBe('AntigravityError');
    }).pipe(Effect.provide(layer)),
  );

  it.live('respond answers an elicitation', () =>
    Effect.gen(function* () {
      const service = yield* Antigravity;
      const id = idOf(yield* created);
      const outs = yield* send(id, 'question', (out) =>
        out._tag === 'Requested'
          ? service.respond(id, out.request.id, {
              action: 'accept',
              content: { q1: '2' },
            })
          : Effect.void,
      );
      const requested = outs.find((out) => out._tag === 'Requested');
      expect(requested?._tag === 'Requested' && requested.request.method).toBe(
        'elicitation/create',
      );
      expect(ended(outs)?.status).toBe('completed');
    }).pipe(Effect.provide(layer)),
  );

  it.live('cancel stops the Run and keeps the instance', () =>
    Effect.gen(function* () {
      const service = yield* Antigravity;
      const id = idOf(yield* created);
      const before = yield* service.connection(id);
      const outs = yield* send(id, 'cancel', (out) =>
        out._tag === 'Requested' ? service.cancel(id) : Effect.void,
      );
      expect(ended(outs)?.status).toBe('cancelled');
      expect((yield* service.live).map((live) => live.id)).toEqual([id]);
      const again = yield* send(id, 'send');
      expect(ended(again)?.status).toBe('completed');
      expect(yield* service.connection(id)).toBe(before);
    }).pipe(Effect.provide(layer)),
  );

  it.live('methods that need a live instance fail NotLive', () =>
    Effect.gen(function* () {
      const service = yield* Antigravity;
      const all = yield* Effect.all([
        failsWith(service.respond('nobody', 1, { action: 'cancel' })),
        failsWith(service.cancel('nobody')),
        failsWith(service.closeSession('nobody')),
        failsWith(service.connection('nobody')),
        failsWith(
          service.setConfigOption({
            sessionId: 'nobody',
            configId: 'model',
            value: 'x',
          }),
        ),
      ]);
      expect(all).toEqual(Array.from({ length: 5 }, () => 'NotLive'));
    }).pipe(Effect.provide(layer)),
  );

  it.live('an instance lingers, then goes', () =>
    Effect.gen(function* () {
      const service = yield* Antigravity;
      const id = idOf(yield* created);
      expect((yield* service.live).map((live) => live.id)).toEqual([id]);
      yield* Effect.sleep('250 millis');
      expect(yield* service.live).toEqual([]);
    }).pipe(Effect.provide(layer)),
  );

  it.live('the process dying mid-Run fails the Run, and send resumes', () =>
    Effect.gen(function* () {
      const service = yield* Antigravity;
      const id = idOf(yield* created);
      const before = yield* service.connection(id);
      const died = yield* send(id, 'dies');
      expect(ended(died)?.status).toBe('failed');
      expect(yield* service.live).toEqual([]);
      const again = yield* send(id, 'send');
      expect(ended(again)?.status).toBe('completed');
      expect(yield* service.connection(id)).not.toBe(before);
    }).pipe(Effect.provide(layer)),
  );

  it.live('a late reader gets the instance now, and every Run element', () =>
    Effect.gen(function* () {
      const service = yield* Antigravity;
      const id = idOf(yield* created);
      const now = yield* service.watch(id).pipe(Stream.runHead);
      expect(now._tag === 'Some' && now.value).toMatchObject({
        id,
        status: 'ready',
        queue: 0,
        cwd,
      });
      expect([...(yield* Stream.runCollect(service.watch('nobody')))]).toEqual(
        [],
      );
      const outs = yield* service
        .send({ session: { sessionId: id, cwd }, prompt: text('send') })
        .pipe(
          Stream.tap(() => Effect.sleep('20 millis')),
          Stream.runCollect,
        );
      expect(outs.length).toBe((recordings['send']?.steps.length ?? 0) + 2);
    }).pipe(Effect.provide(layer)),
  );

  it.live('a reader that stops does not cancel the Run', () =>
    Effect.gen(function* () {
      const service = yield* Antigravity;
      const id = idOf(yield* created);
      yield* service
        .send({ session: { sessionId: id, cwd }, prompt: text('send') })
        .pipe(Stream.take(1), Stream.runDrain);
      yield* waitFor(id, (live) => live.status === 'running');
      yield* waitFor(id, (live) => live.status === 'ready');
      const next = yield* send(id, 'send');
      expect(ended(next)?.status).toBe('completed');
    }).pipe(Effect.provide(layer)),
  );

  it.live('an update outside any Run reaches watch', () =>
    Effect.gen(function* () {
      const id = idOf(yield* created);
      const woke = yield* waitFor(
        id,
        (live) =>
          live.update?.update.sessionUpdate === 'agent_message_chunk' &&
          live.update.update.content.type === 'text' &&
          live.update.update.content.text === 'woke',
      ).pipe(Effect.forkChild);
      const outs = yield* send(id, 'wake');
      expect(JSON.stringify(outs)).not.toContain('woke');
      const found = yield* Fiber.join(woke);
      expect(found._tag).toBe('Some');
    }).pipe(Effect.provide(layer)),
  );

  it.live('harness methods answer', () =>
    Effect.gen(function* () {
      const service = yield* Antigravity;
      expect((yield* service.initialize()).agentInfo?.version).toBeDefined();
      expect((yield* service.listSessions()).sessions.length).toBe(1);
      const id = idOf(yield* created);
      const set = yield* service.setConfigOption({
        sessionId: id,
        configId: 'thought_level',
        value: 'medium',
      });
      const level = (
        options: ReadonlyArray<SessionConfigOption> | null | undefined,
      ) =>
        options?.find((option) => option.id === 'thought_level')?.currentValue;
      expect(level(set.configOptions)).toBe('medium');
      expect(level((yield* service.live)[0]?.configOptions)).toBe('medium');
      const result = yield* service.prompt({ cwd, prompt: 'Answer hi' });
      expect(result.structured_output).toEqual({ word: 'hi' });
      yield* service.closeSession(id);
      expect(yield* service.live).toEqual([]);
    }).pipe(Effect.provide(layer)),
  );
});
