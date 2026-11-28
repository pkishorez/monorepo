import type {
  AgentCapabilities,
  RequestPermissionResponse,
} from '@agentclientprotocol/sdk/unstable';
import { describe, expect, it } from '@effect/vitest';
import {
  Context,
  Deferred,
  Effect,
  Fiber,
  Layer,
  Option,
  Stream,
} from 'effect';
import { TestClock } from 'effect/testing';
import type { AcpAgent, Out, Pending, Requested } from '../contract/index.ts';
import { layer, type Recording, recordings } from '../fake/index.ts';

class Agent extends Context.Service<Agent, AcpAgent>()('test/Agent') {}
class Goose extends Context.Service<Goose, AcpAgent>()('test/Goose') {}
class Kiro extends Context.Service<Kiro, AcpAgent>()('test/Kiro') {}

const cwd = '/tmp/ai-toolkit-v2-acp';
const text = (value: string) => [{ type: 'text' as const, text: value }];
const session = (sessionId: string) => ({ sessionId, cwd, mcpServers: [] });
const recording = (name: string) => {
  const found = recordings.find((entry) => entry.name === name);
  if (!found) throw new Error(`no recording ${name}`);
  return found;
};
const reply = recording('reply');
const withCapabilities = (
  agentCapabilities: AgentCapabilities,
  base: Recording = reply,
): Recording => ({
  ...base,
  initialize: { ...base.initialize, agentCapabilities },
});
const allow = (pending: Pending): RequestPermissionResponse => {
  if (pending.method !== 'session/request_permission') {
    throw new Error(`not a permission: ${pending.method}`);
  }
  return {
    outcome: {
      outcome: 'selected',
      optionId: pending.request.options[0]!.optionId,
    },
  };
};
const tags = (outs: ReadonlyArray<Out>) => outs.map((out) => out._tag);
const last = (outs: ReadonlyArray<Out>) => {
  const end = outs.at(-1);
  if (end?._tag !== 'Ended') throw new Error('No Ended last');
  return end;
};

const requestedOn = (stream: Stream.Stream<Out, unknown>) =>
  Effect.gen(function* () {
    const started = yield* Deferred.make<string>();
    const requested = yield* Deferred.make<Requested>();
    const fiber = yield* stream.pipe(
      Stream.tap((out) =>
        out._tag === 'Started'
          ? Deferred.succeed(started, out.id)
          : out._tag === 'Requested'
            ? Deferred.succeed(requested, out)
            : Effect.void,
      ),
      Stream.runCollect,
      Effect.forkChild,
    );
    return {
      fiber,
      id: yield* Deferred.await(started),
      pending: yield* Deferred.await(requested),
    };
  });

describe('Acp fake', () => {
  it.effect('create starts a session and replays its first Run', () =>
    Effect.gen(function* () {
      const service = yield* Agent;
      const outs = yield* service
        .create({ session: { cwd, mcpServers: [] }, prompt: text('reply') })
        .pipe(Stream.runCollect);
      const first = outs[0];
      expect(first?._tag).toBe('Started');
      const id = first?._tag === 'Started' ? first.id : '';
      const records = outs.filter((out) => out._tag === 'Record');
      expect(records.length).toBe(reply.steps.length);
      expect(
        records.every(
          (out) => out._tag === 'Record' && out.record.sessionId === id,
        ),
      ).toBe(true);
      expect(last(outs).status).toBe('completed');
      expect(last(outs).result).toEqual(reply.response);
      const live = yield* service.live;
      expect(live.map((entry) => [entry.id, entry.status])).toEqual([
        [id, 'ready'],
      ]);
      expect(live[0]?.initialize).toEqual(reply.initialize);
    }).pipe(Effect.provide(layer(Agent))),
  );

  it.effect('send goes to the live instance', () =>
    Effect.gen(function* () {
      const service = yield* Agent;
      const created = yield* service
        .create({ session: { cwd, mcpServers: [] }, prompt: text('reply') })
        .pipe(Stream.runCollect);
      const id = created[0]?._tag === 'Started' ? created[0].id : '';
      const sent = yield* service
        .send({ session: session(id), prompt: text('reply') })
        .pipe(Stream.runCollect);
      expect(sent[0]).toEqual(created[0]);
      expect(last(sent).status).toBe('completed');
      expect((yield* service.live).length).toBe(1);
    }).pipe(
      Effect.provide(layer(Agent, { recordings: [withCapabilities({})] })),
    ),
  );

  it.effect.each([
    ['resume', { sessionCapabilities: { resume: {} } }],
    ['load', { loadSession: true }],
  ] as const)('send resumes a session that is not live, by %s', ([, caps]) =>
    Effect.gen(function* () {
      const service = yield* Agent;
      const outs = yield* service
        .send({ session: session('old-session'), prompt: text('reply') })
        .pipe(Stream.runCollect);
      expect(outs[0]).toEqual({ _tag: 'Started', id: 'old-session' });
      expect(last(outs).status).toBe('completed');
    }).pipe(
      Effect.provide(layer(Agent, { recordings: [withCapabilities(caps)] })),
    ),
  );

  it.effect('send fails when the agent can neither load nor resume', () =>
    Effect.gen(function* () {
      const service = yield* Agent;
      const error = yield* service
        .send({ session: session('old-session'), prompt: text('reply') })
        .pipe(Stream.runCollect, Effect.flip);
      expect(error._tag).toBe('AcpError');
      expect(error.message).toContain(
        'neither session/resume nor session/load',
      );
      expect((yield* service.live).length).toBe(0);
    }).pipe(
      Effect.provide(layer(Agent, { recordings: [withCapabilities({})] })),
    ),
  );

  it.effect('a send during a Run queues, and respond lets the Run go on', () =>
    Effect.gen(function* () {
      const service = yield* Agent;
      const { fiber, id, pending } = yield* requestedOn(
        service.create({
          session: { cwd, mcpServers: [] },
          prompt: text('permission'),
        }),
      );
      const live = yield* service.live;
      expect(live[0]?.status).toBe('running');
      expect(live[0]?.requests.map((entry) => entry.requestId)).toEqual([
        pending.requestId,
      ]);
      const queued = yield* service
        .send({ session: session(id), prompt: text('send') })
        .pipe(Stream.runCollect, Effect.forkChild);
      yield* service.watch(id).pipe(
        Stream.filter((entry) => entry.queue === 1),
        Stream.runHead,
      );
      yield* service.respond(id, pending.requestId, allow(pending));
      const first = yield* Fiber.join(fiber);
      const second = yield* Fiber.join(queued);
      expect(last(first).status).toBe('completed');
      expect(tags(second).slice(0, 2)).toEqual(['Started', 'Queued']);
      expect(second[1]).toEqual({ _tag: 'Queued', position: 1 });
      expect(last(second).status).toBe('completed');
      expect((yield* service.live)[0]?.queue).toBe(0);
    }).pipe(Effect.provide(layer(Agent))),
  );

  it.effect('respond fails for an unknown request', () =>
    Effect.gen(function* () {
      const service = yield* Agent;
      const { fiber, id, pending } = yield* requestedOn(
        service.create({
          session: { cwd, mcpServers: [] },
          prompt: text('permission'),
        }),
      );
      const error = yield* service
        .respond(id, 'nope', allow(pending))
        .pipe(Effect.flip);
      expect(error._tag).toBe('AcpError');
      yield* service.respond(id, pending.requestId, allow(pending));
      yield* Fiber.join(fiber);
    }).pipe(Effect.provide(layer(Agent))),
  );

  it.effect('cancel ends the Run cancelled and answers its requests', () =>
    Effect.gen(function* () {
      const service = yield* Agent;
      const { fiber, id } = yield* requestedOn(
        service.create({
          session: { cwd, mcpServers: [] },
          prompt: text('permission'),
        }),
      );
      yield* service.cancel(id);
      const outs = yield* Fiber.join(fiber);
      expect(last(outs).status).toBe('cancelled');
      expect((yield* service.live)[0]?.requests).toEqual([]);
    }).pipe(Effect.provide(layer(Agent))),
  );

  it.effect('an elicitation is Requested, and respond accepts it', () =>
    Effect.gen(function* () {
      const service = yield* Agent;
      const { fiber, id, pending } = yield* requestedOn(
        service.create({
          session: { cwd, mcpServers: [] },
          prompt: text('question'),
        }),
      );
      expect(pending.method).toBe('elicitation/create');
      expect(pending.request).toMatchObject({ mode: 'form', sessionId: id });
      expect((yield* service.live)[0]?.requests).toEqual([
        {
          requestId: pending.requestId,
          method: pending.method,
          request: pending.request,
        },
      ]);
      const wrong = yield* service
        .respond(id, pending.requestId, { outcome: { outcome: 'cancelled' } })
        .pipe(Effect.flip);
      expect(wrong.message).toContain('does not fit elicitation/create');
      yield* service.respond(id, pending.requestId, {
        action: 'accept',
        content: { q1: '1' },
      });
      const outs = yield* Fiber.join(fiber);
      expect(last(outs).status).toBe('completed');
      expect((yield* service.live)[0]?.requests).toEqual([]);
    }).pipe(Effect.provide(layer(Agent))),
  );

  it.effect.each(['decline', 'cancel'] as const)(
    'an elicitation answered %s lets the Run go on',
    (action) =>
      Effect.gen(function* () {
        const service = yield* Agent;
        const { fiber, id, pending } = yield* requestedOn(
          service.create({
            session: { cwd, mcpServers: [] },
            prompt: text('question'),
          }),
        );
        yield* service.respond(id, pending.requestId, { action });
        expect(last(yield* Fiber.join(fiber)).status).toBe('completed');
      }).pipe(Effect.provide(layer(Agent))),
  );

  it.effect('cancel answers a pending elicitation cancel', () =>
    Effect.gen(function* () {
      const service = yield* Agent;
      const { fiber, id } = yield* requestedOn(
        service.create({
          session: { cwd, mcpServers: [] },
          prompt: text('question'),
        }),
      );
      yield* service.cancel(id);
      expect(last(yield* Fiber.join(fiber)).status).toBe('cancelled');
      expect((yield* service.live)[0]?.requests).toEqual([]);
    }).pipe(Effect.provide(layer(Agent))),
  );

  it.effect('calls on a session that is not live fail NotLive', () =>
    Effect.gen(function* () {
      const service = yield* Agent;
      const errors = yield* Effect.all([
        service.cancel('gone').pipe(Effect.flip),
        service
          .respond('gone', 1, { outcome: { outcome: 'cancelled' } })
          .pipe(Effect.flip),
        service
          .setMode({ sessionId: 'gone', modeId: 'default' })
          .pipe(Effect.flip),
        service.connection('gone').pipe(Effect.flip),
      ]);
      expect(errors.map((error) => error._tag)).toEqual([
        'NotLive',
        'NotLive',
        'NotLive',
        'NotLive',
      ]);
      expect(yield* service.watch('gone').pipe(Stream.runCollect)).toEqual([]);
    }).pipe(Effect.provide(layer(Agent))),
  );

  it.effect('an instance lingers after its last reader, then stops', () =>
    Effect.gen(function* () {
      const service = yield* Agent;
      yield* service
        .create({ session: { cwd, mcpServers: [] }, prompt: text('reply') })
        .pipe(Stream.runCollect);
      yield* TestClock.adjust('29 seconds');
      expect((yield* service.live).length).toBe(1);
      yield* TestClock.adjust('2 seconds');
      expect((yield* service.live).length).toBe(0);
    }).pipe(Effect.provide(layer(Agent))),
  );

  it.effect('a late watch reader sees the instance and holds it', () =>
    Effect.gen(function* () {
      const service = yield* Agent;
      const outs = yield* service
        .create({ session: { cwd, mcpServers: [] }, prompt: text('reply') })
        .pipe(Stream.runCollect);
      const id = outs[0]?._tag === 'Started' ? outs[0].id : '';
      yield* TestClock.adjust('20 seconds');
      const watching = yield* service
        .watch(id)
        .pipe(Stream.runCollect, Effect.forkChild);
      yield* TestClock.adjust('1 minute');
      expect((yield* service.live).length).toBe(1);
      yield* Fiber.interrupt(watching);
      yield* TestClock.adjust('31 seconds');
      expect((yield* service.live).length).toBe(0);
      const first = yield* service.watch(id).pipe(Stream.runHead);
      expect(Option.isNone(first)).toBe(true);
    }).pipe(Effect.provide(layer(Agent))),
  );

  it.effect('a reader that stops reading does not cancel its Run', () =>
    Effect.gen(function* () {
      const service = yield* Agent;
      const head = yield* service
        .create({
          session: { cwd, mcpServers: [] },
          prompt: text('permission'),
        })
        .pipe(Stream.take(1), Stream.runCollect);
      const id = head[0]?._tag === 'Started' ? head[0].id : '';
      const live = yield* service.watch(id).pipe(
        Stream.filter((entry) => entry.requests.length === 1),
        Stream.runHead,
      );
      const pending = Option.getOrThrow(live).requests[0]!;
      yield* service.respond(id, pending.requestId, allow(pending));
      const ready = yield* service.watch(id).pipe(
        Stream.filter((entry) => entry.status === 'ready'),
        Stream.runHead,
      );
      expect(Option.isSome(ready)).toBe(true);
    }).pipe(Effect.provide(layer(Agent))),
  );

  it.effect(
    'the process dying mid-Run ends it failed; the next send resumes',
    () =>
      Effect.gen(function* () {
        const service = yield* Agent;
        const outs = yield* service
          .create({ session: { cwd, mcpServers: [] }, prompt: text('die') })
          .pipe(Stream.runCollect);
        const id = outs[0]?._tag === 'Started' ? outs[0].id : '';
        expect(last(outs).status).toBe('failed');
        expect((yield* service.live).length).toBe(0);
        const resumed = yield* service
          .send({ session: session(id), prompt: text('reply') })
          .pipe(Stream.runCollect);
        expect(resumed[0]).toEqual({ _tag: 'Started', id });
        expect(last(resumed).status).toBe('completed');
      }).pipe(
        Effect.provide(
          layer(Agent, {
            recordings: [
              reply,
              {
                ...reply,
                name: 'die',
                steps: [reply.steps.at(-2)!, { exit: true }],
              },
            ],
          }),
        ),
      ),
  );

  it.effect('fork needs the agent to offer session/fork', () =>
    Effect.gen(function* () {
      const service = yield* Agent;
      const error = yield* service
        .fork({ session: session('source'), prompt: text('reply') })
        .pipe(Stream.runCollect, Effect.flip);
      expect(error.message).toContain('session/fork');
    }).pipe(Effect.provide(layer(Agent))),
  );

  it.effect('fork starts a new session from another', () =>
    Effect.gen(function* () {
      const service = yield* Agent;
      const outs = yield* service
        .fork({ session: session('source'), prompt: text('reply') })
        .pipe(Stream.runCollect);
      expect(outs[0]?._tag).toBe('Started');
      expect(outs[0]).not.toEqual({ _tag: 'Started', id: 'source' });
      expect(last(outs).status).toBe('completed');
    }).pipe(
      Effect.provide(
        layer(Agent, {
          recordings: [withCapabilities({ sessionCapabilities: { fork: {} } })],
        }),
      ),
    ),
  );

  it.effect('harness methods answer from the recording', () =>
    Effect.gen(function* () {
      const service = yield* Agent;
      expect(yield* service.initialize).toEqual(reply.initialize);
      expect(yield* service.listSessions({ cwd })).toEqual({ sessions: [] });
      const outs = yield* service
        .create({ session: { cwd, mcpServers: [] }, prompt: text('reply') })
        .pipe(Stream.runCollect);
      const id = outs[0]?._tag === 'Started' ? outs[0].id : '';
      yield* service.setMode({ sessionId: id, modeId: 'plan' });
      yield* service.setConfigOption({
        sessionId: id,
        configId: 'model',
        value: 'gemini-3.8-flash',
      });
      const live = (yield* service.live)[0];
      expect(live?.modes?.currentModeId).toBe('plan');
      expect(yield* service.connection(id)).toBeDefined();
    }).pipe(Effect.provide(layer(Agent))),
  );

  it.effect('two agents, each its own tag, run independently', () =>
    Effect.gen(function* () {
      const goose = yield* Goose;
      const kiro = yield* Kiro;
      const said = (outs: ReadonlyArray<Out>) =>
        outs.flatMap((out) =>
          out._tag === 'Record' &&
          out.record.update.sessionUpdate === 'agent_message_chunk' &&
          out.record.update.content.type === 'text'
            ? [out.record.update.content.text]
            : [],
        );
      const fromGoose = yield* goose
        .create({ session: { cwd, mcpServers: [] }, prompt: text('hello') })
        .pipe(Stream.runCollect);
      const fromKiro = yield* kiro
        .create({ session: { cwd, mcpServers: [] }, prompt: text('hello') })
        .pipe(Stream.runCollect);
      const gooseId = fromGoose[0]?._tag === 'Started' ? fromGoose[0].id : '';
      const kiroId = fromKiro[0]?._tag === 'Started' ? fromKiro[0].id : '';
      expect(said(fromGoose)).toEqual(['YES']);
      expect(said(fromKiro)).not.toEqual(['YES']);
      expect((yield* goose.live).map((live) => live.id)).toEqual([gooseId]);
      expect((yield* kiro.live).map((live) => live.id)).toEqual([kiroId]);
      const error = yield* kiro.cancel(gooseId).pipe(Effect.flip);
      expect(error._tag).toBe('NotLive');
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          layer(Goose, { recordings: [recording('send')] }),
          layer(Kiro, { recordings: [reply] }),
        ),
      ),
    ),
  );
});
