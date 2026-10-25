import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Effect, Fiber, Layer, Option, Stream, type Scope } from 'effect';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FAKE_SKILLS,
  makeFakeHarness,
  type FakeHarness,
} from '@kestack/ai-toolkit/harness/fake';
import type { Raw } from '@kestack/ai-toolkit/contract';
import { Engine, Store, storeLayer, type SessionJobs } from '../index.js';

/*
 * The engine's features beyond running Turns, over the fake harness: per-turn
 * model, Attachments, Fork Points and Forks, Asks, Titles, Skills, what a
 * Session's agent reports, Background Jobs, Agent-started Turns and Harness
 * Binaries.
 */

const folders: Array<string> = [];
const folder = () => {
  const made = mkdtempSync(join(tmpdir(), 'ai-features-'));
  folders.push(made);
  return made;
};
afterEach(() => {
  for (const made of folders.splice(0)) rmSync(made, { recursive: true });
});

const run = <A, E>(
  effect: Effect.Effect<A, E, Engine | Store | Scope.Scope>,
  fake: FakeHarness,
  options: { readonly path?: string; readonly attachments?: string } = {},
) => {
  const base = Layer.merge(storeLayer(options.path ?? ':memory:'), fake.layer);
  const world = Layer.merge(
    base,
    Engine.layer({
      attachments: options.attachments ?? folder(),
      home: folder(),
    }).pipe(Layer.provide(base)),
  );
  return Effect.runPromise(Effect.scoped(effect).pipe(Effect.provide(world)));
};

const eventually = (assertion: () => Promise<void> | void) =>
  Effect.promise(() => vi.waitFor(assertion, { timeout: 3000, interval: 10 }));

const rawsOf = (store: Store['Service'], sessionId: string) =>
  Effect.runPromise(store.raws(sessionId).after(null, 1000)).then(({ items }) =>
    items.map(({ value }) => value),
  );

const brief = (raw: Raw) =>
  `${raw.harness} ${raw.kind} ${JSON.stringify(raw.payload)}`;

const say = (text: string) => ({ text, attachments: [] });

/** A project with one session, started on `text`. */
const started = (text = 'hello') =>
  Effect.gen(function* () {
    const engine = yield* Engine;
    const store = yield* Store;
    const project = yield* engine.addProject(folder());
    const session = yield* engine.startSession({
      projectId: project.id,
      harness: 'claude',
      model: 'claude-test',
      settings: { effort: 'high' },
      text,
      attachments: [],
    });
    const raws = (id = session.id) => rawsOf(store, id);
    const saved = async (id = session.id) =>
      Effect.runPromise(store.session(id));
    const idle = (id = session.id) =>
      eventually(async () => expect((await saved(id))?.status).toBe('idle'));
    return { engine, store, project, session, raws, saved, idle };
  });

const PNG = Buffer.from('a tiny png').toString('base64');

describe('a Turn', () => {
  it("takes a message's model and settings from that Turn on", async () => {
    const fake = makeFakeHarness();
    await run(
      Effect.gen(function* () {
        const { engine, session, saved, idle } = yield* started();
        yield* idle();
        yield* engine.send(session.id, {
          ...say('switch'),
          model: 'claude-other',
          settings: { effort: 'low' },
        });
        yield* eventually(async () =>
          expect(await saved()).toMatchObject({
            model: 'claude-other',
            settings: { effort: 'low' },
          }),
        );
        expect(fake.inputs.at(-1)).toMatchObject({
          text: 'switch',
          model: 'claude-other',
          settings: { effort: 'low' },
        });

        // Settings a message leaves out keep their value.
        yield* idle();
        yield* engine.send(session.id, {
          ...say('plan'),
          settings: { permissionMode: 'plan' },
        });
        yield* eventually(async () =>
          expect((await saved())?.settings).toEqual({
            effort: 'low',
            permissionMode: 'plan',
          }),
        );
      }),
      fake,
    );
  });

  it('sends images to the harness, and saves any other file and names it in the text', async () => {
    const fake = makeFakeHarness();
    const attachments = folder();
    await run(
      Effect.gen(function* () {
        const engine = yield* Engine;
        const store = yield* Store;
        const project = yield* engine.addProject(folder());
        const session = yield* engine.startSession({
          projectId: project.id,
          harness: 'claude',
          model: 'claude-test',
          settings: {},
          text: 'look',
          attachments: [
            { name: 'shot.png', mime: 'image/png', data: PNG },
            {
              name: '../my notes.txt',
              mime: 'text/plain',
              data: Buffer.from('remember').toString('base64'),
            },
          ],
        });
        yield* eventually(() => expect(fake.inputs).toHaveLength(1));
        const input = fake.inputs[0]!;
        expect(input.images).toEqual([
          { name: 'shot.png', mime: 'image/png', data: PNG },
        ]);
        const [text, line] = input.text.split('\n');
        expect(text).toBe('look');
        const saved = /^Attached file: (.+) \(text\/plain\)$/.exec(line ?? '');
        expect(saved?.[1]).toMatch(
          new RegExp(`^${join(attachments, session.id)}/\\w+-my_notes\\.txt$`),
        );
        expect(readFileSync(saved![1]!, 'utf8')).toBe('remember');

        const first = (yield* Effect.promise(() =>
          rawsOf(store, session.id),
        ))[0]!;
        expect(first.payload).toEqual({
          text: 'look',
          steered: false,
          attachments: [
            { name: 'shot.png', mime: 'image/png', size: 10, data: PNG },
            {
              name: '../my notes.txt',
              mime: 'text/plain',
              size: 8,
              path: saved![1],
            },
          ],
        });
      }),
      fake,
      { attachments },
    );
  });

  it('writes the Fork Point into turn.ended only when the agent moved to a new one', async () => {
    const fake = makeFakeHarness({ hold: true });
    await run(
      Effect.gen(function* () {
        const { engine, session, raws } = yield* started();
        yield* eventually(async () => expect(await raws()).toHaveLength(2));
        yield* fake.finish;
        yield* eventually(async () => expect(await raws()).toHaveLength(4));
        yield* engine.send(session.id, say('stop me'));
        yield* eventually(async () => expect(await raws()).toHaveLength(6));
        yield* engine.cancel(session.id);
        yield* eventually(async () => expect(await raws()).toHaveLength(7));
        const ends = (yield* Effect.promise(() => raws()))
          .filter((raw) => raw.kind === 'turn.ended')
          .map(brief);
        expect(ends).toEqual([
          'engine turn.ended {"status":"done","nativeTurnId":"native-1:turn-1","byHarness":true}',
          'engine turn.ended {"status":"cancelled"}',
        ]);
      }),
      fake,
    );
  });
});

describe('a Fork', () => {
  it('copies nothing, and records the Turn it forks after', async () => {
    const fake = makeFakeHarness();
    await run(
      Effect.gen(function* () {
        const { engine, session, raws, saved, idle } = yield* started();
        yield* idle();
        const firstTurn = (yield* Effect.promise(() => raws()))[0]!.turnId;
        yield* engine.send(session.id, say('second'));
        yield* eventually(async () => expect(await raws()).toHaveLength(8));
        yield* idle();

        const fork = yield* engine.forkSession(session.id, firstTurn);
        expect(fake.forks.at(-1)).toEqual({
          cwd: fake.opens[0]!.cwd,
          nativeId: 'native-1',
          at: 'native-1:turn-1',
        });
        expect(fork).toMatchObject({
          projectId: session.projectId,
          harness: 'claude',
          model: 'claude-test',
          settings: { effort: 'high' },
          title: 'hello',
          status: 'idle',
          nativeId: 'native-1-fork',
          forkedFrom: { sessionId: session.id, turnId: firstTurn },
        });
        yield* eventually(async () =>
          expect(await saved(fork.id)).toMatchObject({ status: 'idle' }),
        );
        expect(yield* Effect.promise(() => raws(fork.id))).toEqual([]);
        expect(fork.activeAt).toBe(fork.createdAt);
        expect(fork.settledAt).toBeNull();

        // Null forks after the latest finished Turn.
        yield* engine.forkSession(session.id, null);
        expect(fake.forks.at(-1)?.at).toBe('native-1:turn-2');

        // The Fork runs on its own agent, resumed by the fork's native id.
        yield* engine.send(fork.id, say('in the fork'));
        yield* eventually(() =>
          expect(fake.opens.at(-1)?.nativeId).toBe('native-1-fork'),
        );
      }),
      fake,
    );
  });

  it('forks a Fork after a Turn it inherited: the agent from the Session that ran it, named as the Fork', async () => {
    const fake = makeFakeHarness();
    await run(
      Effect.gen(function* () {
        const { engine, session, raws, idle } = yield* started();
        yield* idle();
        const firstTurn = (yield* Effect.promise(() => raws()))[0]!.turnId;
        yield* engine.send(session.id, say('second'));
        yield* eventually(async () => expect(await raws()).toHaveLength(8));
        yield* idle();
        const secondTurn = (yield* Effect.promise(() => raws()))[4]!.turnId;
        const fork = yield* engine.forkSession(session.id, firstTurn);

        // With no Turn of its own, the latest is the one it was forked after.
        const again = yield* engine.forkSession(fork.id, null);
        expect(again.forkedFrom).toEqual({
          sessionId: fork.id,
          turnId: firstTurn,
        });
        // A Fork of that one finds the Turn up the whole chain.
        const third = yield* engine.forkSession(again.id, firstTurn);
        expect(third.forkedFrom).toEqual({
          sessionId: again.id,
          turnId: firstTurn,
        });
        expect(fake.forks.at(-1)).toMatchObject({
          nativeId: 'native-1',
          at: 'native-1:turn-1',
        });
        // A Turn of the original after the Fork Point is not the Fork's.
        const refused = yield* Effect.flip(
          engine.forkSession(fork.id, secondTurn),
        );
        expect(refused).toMatchObject({
          _tag: 'NotForkable',
          reason: 'This Session has no such Turn',
        });

        // After a Turn of its own, the Fork is what holds it.
        yield* engine.send(fork.id, say('in the fork'));
        yield* idle(fork.id);
        const own = (yield* Effect.promise(() => raws(fork.id)))[0]!.turnId;
        const ofFork = yield* engine.forkSession(fork.id, null);
        expect(ofFork.forkedFrom).toEqual({ sessionId: fork.id, turnId: own });
        expect(fake.forks.at(-1)?.nativeId).toBe('native-1-fork');
      }),
      fake,
    );
  });

  it('never reads an original past the tightest Fork Point up the chain', async () => {
    const fake = makeFakeHarness();
    await run(
      Effect.gen(function* () {
        const { engine, session, raws, idle } = yield* started();
        yield* idle();
        const firstTurn = (yield* Effect.promise(() => raws()))[0]!.turnId;
        yield* engine.send(session.id, say('second'));
        yield* eventually(async () => expect(await raws()).toHaveLength(8));
        yield* idle();
        const secondTurn = (yield* Effect.promise(() => raws()))[4]!.turnId;

        // `fork` holds both Turns; `nested` was made after the first only.
        const fork = yield* engine.forkSession(session.id, secondTurn);
        const nested = yield* engine.forkSession(fork.id, firstTurn);
        expect(
          yield* Effect.flip(engine.forkSession(nested.id, secondTurn)),
        ).toMatchObject({
          _tag: 'NotForkable',
          reason: 'This Session has no such Turn',
        });
        // Its latest is still the Turn it was made after.
        const latest = yield* engine.forkSession(nested.id, null);
        expect(latest.forkedFrom).toEqual({
          sessionId: nested.id,
          turnId: firstTurn,
        });
        expect(fake.forks.at(-1)?.at).toBe('native-1:turn-1');
      }),
      fake,
    );
  });

  it('refuses a running Turn, an unknown one, and one without a Fork Point', async () => {
    const fake = makeFakeHarness({ hold: true });
    await run(
      Effect.gen(function* () {
        const { engine, session, raws } = yield* started();
        yield* eventually(async () => expect(await raws()).toHaveLength(2));
        const turnId = (yield* Effect.promise(() => raws()))[0]!.turnId;
        const reasonOf = (afterTurnId: string | null) =>
          Effect.map(
            Effect.flip(engine.forkSession(session.id, afterTurnId)),
            (error) =>
              error._tag === 'NotForkable' ? error.reason : error._tag,
          );

        expect(yield* reasonOf(turnId)).toBe('That Turn is still running');
        expect(yield* reasonOf(null)).toBe('No Turn has finished yet');
        expect(yield* reasonOf('nope')).toBe('This Session has no such Turn');

        yield* engine.cancel(session.id);
        yield* eventually(async () => expect(await raws()).toHaveLength(3));
        expect(yield* reasonOf(turnId)).toMatch(/without a Fork Point/);
        expect(
          (yield* Effect.flip(engine.forkSession('nope', null)))._tag,
        ).toBe('SessionNotFound');
        expect(fake.forks).toHaveLength(0);
      }),
      fake,
    );
  });

  it('refuses a Session with no native id, and so does an Ask', async () => {
    const path = join(folder(), 'ai.db');
    const fake = makeFakeHarness();
    const ids = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const store = yield* Store;
          const project = {
            id: 'p1',
            path: folder(),
            name: 'p',
            createdAt: 1,
          };
          yield* store.saveProject(project);
          yield* store.saveSession({
            id: 's1',
            projectId: project.id,
            harness: 'claude',
            model: 'claude-test',
            settings: {},
            title: 'Never ran',
            status: 'idle',
            nativeId: null,
            createdAt: 1,
            forkedFrom: null,
            settledAt: null,
            activeAt: 1,
            endedAt: null,
          });
          return { sessionId: 's1' };
        }),
      ).pipe(Effect.provide(storeLayer(path))),
    );
    await run(
      Effect.gen(function* () {
        const engine = yield* Engine;
        const forked = yield* Effect.flip(
          engine.forkSession(ids.sessionId, null),
        );
        expect(forked).toMatchObject({
          _tag: 'NotForkable',
          reason: 'This session has no agent context to fork yet',
        });
        const asked = yield* Effect.flip(
          engine.ask(ids.sessionId, 'why?', null),
        );
        expect(asked._tag).toBe('AskFailed');
        expect(asked.message).toMatch(/no context to ask about yet/);
        expect(fake.asks).toHaveLength(0);
      }),
      fake,
      { path },
    );
  });
});

describe('Settling a Session', () => {
  it('keeps it out of the way until a message un-settles it, and never stops its Turn', async () => {
    const fake = makeFakeHarness({ hold: true });
    await run(
      Effect.gen(function* () {
        const { engine, session, saved, raws, idle } = yield* started();
        expect(session).toMatchObject({
          settledAt: null,
          activeAt: session.createdAt,
        });
        yield* eventually(async () => expect(await raws()).toHaveLength(2));

        yield* engine.settleSession(session.id);
        yield* eventually(async () =>
          expect((await saved())?.settledAt).toBeTypeOf('number'),
        );
        const settledAt = (yield* Effect.promise(() => saved()))!.settledAt;
        // Settling again keeps when it was; the Turn runs on.
        yield* engine.settleSession(session.id);
        expect(yield* Effect.promise(() => saved())).toMatchObject({
          settledAt,
          status: 'running',
        });

        yield* engine.unsettleSession(session.id);
        yield* eventually(async () =>
          expect((await saved())?.settledAt).toBeNull(),
        );

        // A steer un-settles it, and does not start a Turn.
        yield* engine.settleSession(session.id);
        yield* eventually(async () =>
          expect((await saved())?.settledAt).not.toBeNull(),
        );
        yield* engine.send(session.id, say('steer'));
        yield* eventually(async () =>
          expect((await saved())?.settledAt).toBeNull(),
        );
        expect((yield* Effect.promise(() => saved()))?.activeAt).toBe(
          session.activeAt,
        );
        yield* fake.finish;
        yield* idle();

        // A new Turn marks it active.
        // Past the millisecond the first Turn started in.
        yield* Effect.sleep('2 millis');
        yield* engine.send(session.id, say('next'));
        yield* eventually(async () =>
          expect((await saved())?.activeAt).toBeGreaterThan(session.activeAt),
        );

        expect((yield* Effect.flip(engine.settleSession('nope')))._tag).toBe(
          'SessionNotFound',
        );
        expect((yield* Effect.flip(engine.unsettleSession('nope')))._tag).toBe(
          'SessionNotFound',
        );
      }),
      fake,
    );
  });
});

describe('asking a Session', () => {
  it('answers from its context and stores nothing', async () => {
    const fake = makeFakeHarness();
    await run(
      Effect.gen(function* () {
        const { engine, session, raws, idle } = yield* started();
        yield* idle();
        const before = yield* Effect.promise(() => raws());
        expect(yield* engine.ask(session.id, 'what?', null)).toEqual({
          _tag: 'Text',
          text: 'answer:what?',
        });
        const schema = { type: 'object' };
        expect(yield* engine.ask(session.id, 'shape?', schema)).toEqual({
          _tag: 'Data',
          data: { question: 'shape?' },
        });
        expect(fake.asks).toEqual([
          {
            cwd: fake.opens[0]!.cwd,
            nativeId: 'native-1',
            model: 'claude-test',
            question: 'what?',
          },
          {
            cwd: fake.opens[0]!.cwd,
            nativeId: 'native-1',
            model: 'claude-test',
            question: 'shape?',
            schema,
          },
        ]);
        expect(yield* Effect.promise(() => raws())).toEqual(before);
      }),
      fake,
    );
  });

  it('regenerates the Title from the last five user messages', async () => {
    const fake = makeFakeHarness({ oneShot: 'A greeting' });
    await run(
      Effect.gen(function* () {
        const { engine, session, saved, idle } = yield* started('one');
        for (const text of ['two', 'three', 'four', 'five', 'six']) {
          yield* idle();
          yield* engine.send(session.id, say(text));
          yield* eventually(() => expect(fake.inputs.at(-1)?.text).toBe(text));
        }
        yield* idle();
        expect(yield* engine.regenerateTitle(session.id)).toBe('A greeting');
        // Written from the five latest, the latest leading.
        const asked = fake.prompts.at(-1)!;
        for (const text of ['two', 'three', 'four', 'five'])
          expect(asked).toContain(`<message>\n${text}\n</message>`);
        expect(asked).toContain('<latest-message>\nsix\n</latest-message>');
        expect(asked).not.toContain('\none\n');
        // Both the first title and this one ran with the Harness Binaries.
        expect(fake.promptBinaries).toEqual([true, true]);
        yield* eventually(async () =>
          expect((await saved())?.title).toBe('A greeting'),
        );
      }),
      fake,
    );
  });

  it("lists a harness's Skills in a Project's folder", async () => {
    const fake = makeFakeHarness();
    await run(
      Effect.gen(function* () {
        const engine = yield* Engine;
        const project = yield* engine.addProject(folder());
        expect(yield* engine.skills(project.id, 'claude')).toEqual(FAKE_SKILLS);
        expect((yield* Effect.flip(engine.skills('nope', 'claude')))._tag).toBe(
          'ProjectNotFound',
        );
      }),
      fake,
    );
  });

  it('reads MCP Server Status and Context Usage from the open agent, and never opens it', async () => {
    const path = join(folder(), 'ai.db');
    const fake = makeFakeHarness();
    const sessionId = await run(
      Effect.gen(function* () {
        const { engine, session, idle } = yield* started();
        yield* idle();
        // The agent stays open between Turns: it answers.
        expect(fake.opens).toHaveLength(1);
        expect(yield* engine.mcpStatus(session.id)).toEqual([
          { name: 'fake-mcp', status: 'connected', tools: 1 },
        ]);
        expect(yield* engine.contextUsage(session.id)).toEqual({
          usedTokens: 1000,
          maxTokens: 200000,
          rateLimits: [],
        });
        expect(fake.opens).toHaveLength(1);
        expect((yield* Effect.flip(engine.mcpStatus('nope')))._tag).toBe(
          'SessionNotFound',
        );
        return session.id;
      }),
      fake,
      { path },
    );
    await run(
      Effect.gen(function* () {
        const engine = yield* Engine;
        // After a restart the agent is closed until the next Turn: a Query says so, and opens nothing.
        const refused = yield* Effect.flip(engine.mcpStatus(sessionId));
        expect(refused).toMatchObject({
          _tag: 'HarnessFailed',
          message: "The session's agent is not running",
        });
        expect(fake.opens).toHaveLength(1);
      }),
      fake,
      { path },
    );
  });
});

describe('Background Jobs', () => {
  it('stream as whole snapshots, stop by id, and vanish with their Session', async () => {
    const fake = makeFakeHarness();
    await run(
      Effect.gen(function* () {
        const { engine, project, session, idle } = yield* started();
        yield* idle();
        const seen: Array<ReadonlyArray<SessionJobs>> = [];
        const watching = yield* Effect.forkScoped(
          Stream.runForEach(engine.backgroundJobs, (now) =>
            Effect.sync(() => void seen.push(now)),
          ),
        );
        yield* eventually(() => expect(seen).toEqual([[]]));

        const build = { id: 'j1', kind: 'shell' as const, title: 'pnpm build' };
        const agent = { id: 'j2', kind: 'agent' as const, title: 'Explore' };
        yield* fake.setJobs('native-1', [build, agent]);
        const row = (jobs: ReadonlyArray<typeof build | typeof agent>) => ({
          sessionId: session.id,
          projectId: project.id,
          jobs,
        });
        yield* eventually(() =>
          expect(seen.at(-1)).toEqual([row([build, agent])]),
        );

        yield* engine.stopBackgroundJob(session.id, 'j1');
        yield* eventually(() => expect(fake.stoppedJobs).toEqual(['j1']));
        yield* eventually(() => expect(seen.at(-1)).toEqual([row([agent])]));

        yield* engine.removeProject(project.id);
        yield* eventually(() => expect(seen.at(-1)).toEqual([]));
        yield* eventually(() => expect(fake.closes()).toBe(1));
        yield* Fiber.interrupt(watching);
      }),
      fake,
    );
  });

  it('report a stop the harness refuses, and keep the job', async () => {
    const fake = makeFakeHarness({ refuseStops: true });
    await run(
      Effect.gen(function* () {
        const { engine, session, idle } = yield* started();
        yield* idle();
        const build = { id: 'j1', kind: 'shell' as const, title: 'pnpm build' };
        yield* fake.setJobs('native-1', [build]);
        yield* eventually(async () =>
          expect(
            await Effect.runPromise(Stream.runHead(engine.backgroundJobs)),
          ).toMatchObject({ _tag: 'Some' }),
        );
        const refused = yield* Effect.flip(
          engine.stopBackgroundJob(session.id, 'j1'),
        );
        expect(refused).toMatchObject({
          _tag: 'HarnessFailed',
          message: 'job j1 cannot be stopped',
        });
        // A job the agent does not list is already gone.
        yield* engine.stopBackgroundJob(session.id, 'nope');
      }),
      fake,
    );
  });

  it('clear when the agent closes', async () => {
    const fake = makeFakeHarness({ hold: true });
    await run(
      Effect.gen(function* () {
        const { engine, raws } = yield* started();
        yield* eventually(async () => expect(await raws()).toHaveLength(2));
        yield* fake.setJobs('native-1', [
          { id: 'j1', kind: 'shell', title: 'watch' },
        ]);
        const now = () =>
          Effect.runPromise(Stream.runHead(engine.backgroundJobs)).then(
            Option.getOrThrow,
          );
        yield* eventually(async () => expect(await now()).toHaveLength(1));
        yield* fake.fail('boom');
        yield* eventually(async () => expect(await now()).toEqual([]));
      }),
      fake,
    );
  });
});

describe('Agent-started Turns', () => {
  it('run as Turns while the Session is idle, and a message steers one', async () => {
    const fake = makeFakeHarness({ hold: true });
    await run(
      Effect.gen(function* () {
        const { engine, session, raws, saved, idle } = yield* started();
        yield* eventually(async () => expect(await raws()).toHaveLength(2));
        yield* fake.finish;
        yield* idle();

        yield* fake.startAgentTurn('native-1', 'job done');
        yield* eventually(async () =>
          expect((await saved())?.status).toBe('running'),
        );
        yield* eventually(async () => expect(await raws()).toHaveLength(6));
        yield* engine.send(session.id, say('thanks'));
        yield* eventually(async () => expect(await raws()).toHaveLength(8));
        yield* fake.finish;
        yield* idle();

        const all = yield* Effect.promise(() => raws());
        expect(all.slice(4).map(brief)).toEqual([
          'engine turn.started {"text":"","steered":false,"agentStarted":true}',
          'claude text {"text":"agent:job done"}',
          'engine turn.started {"text":"thanks","steered":true}',
          'claude text {"text":"steer:thanks"}',
          'claude result {}',
          'engine turn.ended {"status":"done","nativeTurnId":"native-1:turn-2","byHarness":true}',
        ]);
        expect(new Set(all.slice(4).map((raw) => raw.turnId)).size).toBe(1);
        expect(all[4]!.turnId).not.toBe(all[0]!.turnId);
      }),
      fake,
    );
  });

  it('wait for a running user Turn to end', async () => {
    const fake = makeFakeHarness({ hold: true });
    await run(
      Effect.gen(function* () {
        const { raws, idle } = yield* started();
        yield* eventually(async () => expect(await raws()).toHaveLength(2));
        yield* fake.startAgentTurn('native-1', 'early');
        yield* Effect.sleep('50 millis');
        expect(yield* Effect.promise(() => raws())).toHaveLength(2);
        yield* fake.finish;
        yield* eventually(async () => expect(await raws()).toHaveLength(6));
        yield* fake.finish;
        yield* idle();
        expect(
          (yield* Effect.promise(() => raws())).slice(4).map(brief),
        ).toEqual([
          'engine turn.started {"text":"","steered":false,"agentStarted":true}',
          'claude text {"text":"agent:early"}',
          'claude result {}',
          'engine turn.ended {"status":"done","nativeTurnId":"native-1:turn-2","byHarness":true}',
        ]);
      }),
      fake,
    );
  });
});

describe('Harness Binaries', () => {
  const executable = (name: string) => {
    const path = join(folder(), name);
    writeFileSync(path, '#!/bin/sh\necho fake\n');
    chmodSync(path, 0o755);
    return path;
  };

  it('are set once they run, reach every new agent, and reset to the default', async () => {
    const fake = makeFakeHarness();
    await run(
      Effect.gen(function* () {
        const engine = yield* Engine;
        expect(yield* engine.harnessBinaries).toEqual([
          {
            harness: 'claude',
            configuredPath: null,
            resolved: {
              path: '/usr/local/bin/fake',
              version: 'fake 1.0.0',
              error: null,
              isDefault: true,
            },
          },
        ]);

        const invalid = (path: string) =>
          Effect.map(
            Effect.flip(engine.setHarnessBinary('claude', path)),
            (error) => error.message,
          );
        expect(yield* invalid('/no/such/binary')).toBe(
          'Nothing is at /no/such/binary',
        );
        const plain = join(folder(), 'plain');
        writeFileSync(plain, 'not a program');
        expect(yield* invalid(plain)).toBe(`${plain} is not executable`);
        const broken = executable('missing-claude');
        expect(yield* invalid(broken)).toBe(`${broken} not found`);

        const good = executable('claude');
        expect(yield* engine.setHarnessBinary('claude', good)).toEqual({
          harness: 'claude',
          configuredPath: good,
          resolved: {
            path: good,
            version: 'fake 1.0.0',
            error: null,
            isDefault: false,
          },
        });
        expect((yield* engine.harnessBinaries)[0]?.configuredPath).toBe(good);

        const { session, idle } = yield* started();
        yield* idle();
        expect(fake.binaries).toEqual([good]);
        expect(existsSync(good)).toBe(true);

        const reset = yield* engine.setHarnessBinary('claude', null);
        expect(reset.configuredPath).toBeNull();
        expect(reset.resolved.isDefault).toBe(true);
        expect(
          (yield* engine.skills(session.projectId, 'claude')).length,
        ).toBeGreaterThan(0);
      }),
      fake,
    );
  });
});
