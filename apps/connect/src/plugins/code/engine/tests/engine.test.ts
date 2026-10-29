import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Effect, Layer, type Scope } from 'effect';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  makeFakeHarness,
  type FakeHarness,
} from '@kestack/ai-toolkit/harness/fake';
import type { Raw } from '@kestack/ai-toolkit/contract';
import { Engine, Store, storeLayer } from '../index.js';

const folders: Array<string> = [];
const folder = () => {
  const made = mkdtempSync(join(tmpdir(), 'ai-engine-'));
  folders.push(made);
  return made;
};
afterEach(() => {
  for (const made of folders.splice(0)) rmSync(made, { recursive: true });
});

const world = (fake: FakeHarness, path = ':memory:') => {
  const base = Layer.merge(storeLayer(path), fake.layer);
  return Layer.merge(
    base,
    Engine.layer({
      attachments: folder(),
      home: folder(),
      worktrees: folder(),
    }).pipe(Layer.provide(base)),
  );
};

const run = <A, E>(
  effect: Effect.Effect<A, E, Engine | Store | Scope.Scope>,
  fake: FakeHarness,
  path?: string,
) =>
  Effect.runPromise(
    Effect.scoped(effect).pipe(Effect.provide(world(fake, path))),
  );

const eventually = (assertion: () => Promise<void> | void) =>
  Effect.promise(() => vi.waitFor(assertion, { timeout: 3000, interval: 10 }));

/** Every Raw of a session, in write order, as `harness kind` plus what tests read. */
const rawsOf = (store: Store['Service'], sessionId: string) =>
  Effect.runPromise(store.raws(sessionId).after(null, 1000)).then(({ items }) =>
    items.map(({ value }) => value),
  );

const say = (text: string) => ({ text, attachments: [] });

const brief = (raw: Raw) =>
  `${raw.harness} ${raw.kind} ${JSON.stringify(raw.payload)}`;

const started = Effect.gen(function* () {
  const engine = yield* Engine;
  const store = yield* Store;
  const project = yield* engine.addProject(folder());
  const session = yield* engine.startSession({
    projectId: project.id,
    account: 'claude',
    model: 'claude-test',
    settings: { effort: 'high' },
    text: 'hello there\nsecond line',
    attachments: [],
  });
  const raws = () => rawsOf(store, session.id);
  const status = async () =>
    (await Effect.runPromise(store.session(session.id)))?.status;
  return { engine, store, project, session, raws, status };
});

/** What a Bootstrap Sweep sends to Resume a cut-off Turn. */
const RESUME_PROMPT =
  'Connect restarted and cut off your last turn, possibly in the middle of a tool call. Check the state of anything you were changing before you repeat it, then continue.';

/** A session left running mid-turn, its native id saved, as a stop leaves it. */
const cutOff = Effect.gen(function* () {
  const { session, raws, store } = yield* started;
  yield* eventually(async () => expect(await raws()).toHaveLength(2));
  yield* eventually(async () =>
    expect((await Effect.runPromise(store.session(session.id)))?.nativeId).toBe(
      'native-1',
    ),
  );
  return session;
});

describe('Engine', () => {
  it('runs a turn: turn.started, every record, then idle with its native id', async () => {
    const fake = makeFakeHarness();
    await run(
      Effect.gen(function* () {
        const { session, raws, store } = yield* started;
        expect(session.status).toBe('running');
        expect(session.title).toBe('hello there');
        yield* eventually(async () => {
          const saved = await Effect.runPromise(store.session(session.id));
          expect(saved).toMatchObject({ status: 'idle', nativeId: 'native-1' });
        });
        const all = yield* Effect.promise(raws);
        expect(all.map(brief)).toEqual([
          'engine turn.started {"text":"hello there\\nsecond line","steered":false}',
          'claude text {"text":"echo:hello there\\nsecond line"}',
          'claude result {}',
          'engine turn.ended {"status":"done","nativeTurnId":"native-1:turn-1","byHarness":true}',
        ]);
        expect(new Set(all.map((raw) => raw.turnId)).size).toBe(1);
        expect(fake.opens).toMatchObject([
          { model: 'claude-test', settings: { effort: 'high' } },
        ]);
        // It keeps when its last Turn ended, once its end is written.
        expect(session.endedAt).toBeNull();
        const saved = yield* store.session(session.id);
        expect(saved?.endedAt).toBeGreaterThanOrEqual(all.at(-1)?.at ?? NaN);
      }),
      fake,
    );
  });

  it('a cancel ends the turn cancelled, and the session stays cancelled', async () => {
    const fake = makeFakeHarness({ hold: true });
    await run(
      Effect.gen(function* () {
        const { raws, status, session, engine, store } = yield* started;
        yield* eventually(async () => expect(await raws()).toHaveLength(2));
        yield* engine.cancel(session.id);
        yield* eventually(async () => expect(await status()).toBe('cancelled'));
        const all = yield* Effect.promise(raws);
        expect(all.map(brief).at(-1)).toBe(
          'engine turn.ended {"status":"cancelled"}',
        );
        expect(
          (yield* store.session(session.id))?.endedAt,
        ).toBeGreaterThanOrEqual(all.at(-1)?.at ?? NaN);
      }),
      fake,
    );
  });

  it('a message sent while running steers the same turn', async () => {
    const fake = makeFakeHarness({ hold: true });
    await run(
      Effect.gen(function* () {
        const { engine, session, raws, status } = yield* started;
        yield* eventually(async () => expect(await raws()).toHaveLength(2));
        yield* engine.send(session.id, say('and more'));
        yield* eventually(async () => expect(await raws()).toHaveLength(4));
        yield* fake.finish;
        yield* eventually(async () => expect(await status()).toBe('idle'));
        const all = yield* Effect.promise(raws);
        expect(all.map(brief)).toEqual([
          'engine turn.started {"text":"hello there\\nsecond line","steered":false}',
          'claude text {"text":"echo:hello there\\nsecond line"}',
          'engine turn.started {"text":"and more","steered":true}',
          'claude text {"text":"steer:and more"}',
          'claude result {}',
          'engine turn.ended {"status":"done","nativeTurnId":"native-1:turn-1","byHarness":true}',
        ]);
        expect(new Set(all.map((raw) => raw.turnId)).size).toBe(1);
      }),
      fake,
    );
  });

  it('a message sent while cancelling starts the next turn once the first ends', async () => {
    const fake = makeFakeHarness({ hold: true });
    await run(
      Effect.gen(function* () {
        const { engine, session, raws } = yield* started;
        yield* eventually(async () => expect(await raws()).toHaveLength(2));
        yield* engine.cancel(session.id);
        yield* engine.send(session.id, say('next'));
        yield* eventually(async () => expect(await raws()).toHaveLength(5));
        const all = yield* Effect.promise(raws);
        expect(all.map(brief).slice(2)).toEqual([
          'engine turn.ended {"status":"cancelled"}',
          'engine turn.started {"text":"next","steered":false}',
          'claude text {"text":"echo:next"}',
        ]);
        expect(all[3]?.turnId).not.toBe(all[0]?.turnId);
      }),
      fake,
    );
  });

  it('a steer sent before the turn has started waits for it', async () => {
    const fake = makeFakeHarness({ hold: true, slowStart: true });
    await run(
      Effect.gen(function* () {
        const { engine, session, raws, status } = yield* started;
        yield* eventually(async () => expect(await raws()).toHaveLength(1));
        yield* engine.send(session.id, say('and more'));
        yield* Effect.sleep('50 millis');
        expect(yield* Effect.promise(raws)).toHaveLength(1);
        yield* fake.begin;
        yield* eventually(async () => expect(await raws()).toHaveLength(4));
        yield* fake.finish;
        yield* eventually(async () => expect(await status()).toBe('idle'));
        const all = yield* Effect.promise(raws);
        expect(all.map(brief).slice(1)).toEqual([
          'claude text {"text":"echo:hello there\\nsecond line"}',
          'engine turn.started {"text":"and more","steered":true}',
          'claude text {"text":"steer:and more"}',
          'claude result {}',
          'engine turn.ended {"status":"done","nativeTurnId":"native-1:turn-1","byHarness":true}',
        ]);
        expect(new Set(all.map((raw) => raw.turnId)).size).toBe(1);
      }),
      fake,
    );
  });

  it('steers of a turn that fails before its first record start the next turn', async () => {
    const fake = makeFakeHarness({ hold: true, slowStart: true });
    await run(
      Effect.gen(function* () {
        const { engine, session, raws, status } = yield* started;
        yield* eventually(async () => expect(await raws()).toHaveLength(1));
        yield* engine.send(session.id, say('one'));
        yield* engine.send(session.id, say('two'));
        yield* fake.fail('setup broke');
        yield* eventually(async () => expect(await raws()).toHaveLength(3));
        yield* fake.begin;
        yield* eventually(async () => expect(await raws()).toHaveLength(6));
        yield* fake.finish;
        yield* eventually(async () => expect(await status()).toBe('idle'));
        const all = yield* Effect.promise(raws);
        expect(all.map(brief).slice(1, 3)).toEqual([
          'engine turn.ended {"status":"failed","error":"setup broke"}',
          'engine turn.started {"text":"one","steered":false}',
        ]);
        expect(all.map(brief).slice(3)).toEqual([
          'claude text {"text":"echo:one"}',
          'engine turn.started {"text":"two","steered":true}',
          'claude text {"text":"steer:two"}',
          'claude result {}',
          'engine turn.ended {"status":"done","nativeTurnId":"native-2:turn-2","byHarness":true}',
        ]);
        expect(all[2]?.turnId).not.toBe(all[0]?.turnId);
        expect(all.slice(2).every((raw) => raw.turnId === all[2]?.turnId)).toBe(
          true,
        );
      }),
      fake,
    );
  });

  it('a steer of a turn cancelled before its first record starts the next turn', async () => {
    const fake = makeFakeHarness({ slowStart: true });
    await run(
      Effect.gen(function* () {
        const { engine, session, raws } = yield* started;
        yield* eventually(async () => expect(await raws()).toHaveLength(1));
        yield* engine.send(session.id, say('instead'));
        yield* engine.cancel(session.id);
        yield* eventually(async () => expect(await raws()).toHaveLength(3));
        yield* fake.begin;
        yield* eventually(async () => expect(await raws()).toHaveLength(6));
        expect((yield* Effect.promise(raws)).map(brief).slice(1)).toEqual([
          'engine turn.ended {"status":"cancelled"}',
          'engine turn.started {"text":"instead","steered":false}',
          'claude text {"text":"echo:instead"}',
          'claude result {}',
          'engine turn.ended {"status":"done","nativeTurnId":"native-1:turn-2","byHarness":true}',
        ]);
      }),
      fake,
    );
  });

  it('a steer the agent refuses because its turn just ended starts the next turn', async () => {
    // The turn ends as soon as it starts, before the waiting steer joins.
    const fake = makeFakeHarness({ slowStart: true });
    await run(
      Effect.gen(function* () {
        const { engine, session, raws, status } = yield* started;
        yield* eventually(async () => expect(await raws()).toHaveLength(1));
        yield* engine.send(session.id, say('late'));
        yield* Effect.sleep('20 millis');
        yield* fake.begin;
        yield* eventually(async () => expect(await raws()).toHaveLength(5));
        yield* fake.begin;
        yield* eventually(async () => expect(await raws()).toHaveLength(8));
        yield* eventually(async () => expect(await status()).toBe('idle'));
        expect((yield* Effect.promise(raws)).map(brief).slice(3)).toEqual([
          'engine turn.ended {"status":"done","nativeTurnId":"native-1:turn-1","byHarness":true}',
          'engine turn.started {"text":"late","steered":false}',
          'claude text {"text":"echo:late"}',
          'claude result {}',
          'engine turn.ended {"status":"done","nativeTurnId":"native-1:turn-2","byHarness":true}',
        ]);
      }),
      fake,
    );
  });

  it('an agent failing after an earlier result ends the turn failed', async () => {
    const fake = makeFakeHarness({ hold: true });
    await run(
      Effect.gen(function* () {
        const { raws, status } = yield* started;
        yield* eventually(async () => expect(await raws()).toHaveLength(2));
        // A result for a Background Job's report, not this turn's.
        yield* fake.emit({ kind: 'result', payload: {} });
        yield* eventually(async () => expect(await raws()).toHaveLength(3));
        yield* fake.fail('Claude Code exited');
        yield* eventually(async () => expect(await status()).toBe('failed'));
        expect((yield* Effect.promise(raws)).map(brief).at(-1)).toBe(
          'engine turn.ended {"status":"failed","error":"Claude Code exited"}',
        );
      }),
      fake,
    );
  });

  it('a cancel after a result for a Background Job ends the turn cancelled', async () => {
    const fake = makeFakeHarness({ hold: true });
    await run(
      Effect.gen(function* () {
        const { engine, session, raws, status } = yield* started;
        yield* eventually(async () => expect(await raws()).toHaveLength(2));
        yield* fake.emit({ kind: 'result', payload: {} });
        yield* eventually(async () => expect(await raws()).toHaveLength(3));
        yield* engine.cancel(session.id);
        yield* eventually(async () => expect(await status()).toBe('cancelled'));
        expect((yield* Effect.promise(raws)).map(brief).at(-1)).toBe(
          'engine turn.ended {"status":"cancelled"}',
        );
      }),
      fake,
    );
  });

  it('a steer the agent took runs once, though its turn ended before the steer returned', async () => {
    const fake = makeFakeHarness({ hold: true, slowSteer: true });
    await run(
      Effect.gen(function* () {
        const { engine, session, raws, status } = yield* started;
        yield* eventually(async () => expect(await raws()).toHaveLength(2));
        yield* engine.send(session.id, say('follow-up'));
        yield* eventually(() => expect(fake.inputs).toHaveLength(2));
        yield* fake.finish;
        yield* eventually(async () => expect(await status()).toBe('idle'));
        yield* Effect.sleep('100 millis');
        expect(fake.inputs.map((input) => input.text)).toEqual([
          'hello there\nsecond line',
          'follow-up',
        ]);
        expect(yield* Effect.promise(raws)).toHaveLength(6);
      }),
      fake,
    );
  });

  it("a steer comes before the agent's answer to it", async () => {
    const fake = makeFakeHarness({ hold: true, slowSteer: true });
    await run(
      Effect.gen(function* () {
        const { engine, session, raws } = yield* started;
        yield* eventually(async () => expect(await raws()).toHaveLength(2));
        yield* engine.send(session.id, say('and more'));
        yield* eventually(async () => expect(await raws()).toHaveLength(4));
        expect((yield* Effect.promise(raws)).map(brief).slice(2)).toEqual([
          'engine turn.started {"text":"and more","steered":true}',
          'claude text {"text":"steer:and more"}',
        ]);
      }),
      fake,
    );
  });

  it('a message sent while idle starts a new turn on the same agent', async () => {
    const fake = makeFakeHarness();
    await run(
      Effect.gen(function* () {
        const { engine, session, raws, status } = yield* started;
        yield* eventually(async () => expect(await status()).toBe('idle'));
        yield* engine.send(session.id, say('again'));
        yield* eventually(async () => expect(await raws()).toHaveLength(8));
        yield* eventually(async () => expect(await status()).toBe('idle'));
        const all = yield* Effect.promise(raws);
        expect(new Set(all.map((raw) => raw.turnId)).size).toBe(2);
        expect(fake.opens).toHaveLength(1);
      }),
      fake,
    );
  });

  it('a failed turn ends failed, closes the agent, and the next turn resumes it', async () => {
    const fake = makeFakeHarness({ hold: true });
    await run(
      Effect.gen(function* () {
        const { engine, session, raws, status } = yield* started;
        yield* eventually(async () => expect(await raws()).toHaveLength(2));
        yield* fake.fail('boom');
        yield* eventually(async () => expect(await status()).toBe('failed'));
        expect((yield* Effect.promise(raws)).map(brief).at(-1)).toBe(
          'engine turn.ended {"status":"failed","error":"boom"}',
        );
        expect(fake.closes()).toBe(1);
        yield* engine.send(session.id, say('retry'));
        yield* eventually(() => expect(fake.opens).toHaveLength(2));
        expect(fake.opens[1]?.nativeId).toBe('native-1');
      }),
      fake,
    );
  });

  it('titles a session with a One-shot Prompt, or keeps the first line', async () => {
    const fake = makeFakeHarness({ oneShot: 'A greeting' });
    await run(
      Effect.gen(function* () {
        const { store, session } = yield* started;
        yield* eventually(async () =>
          expect(
            (await Effect.runPromise(store.session(session.id)))?.title,
          ).toBe('A greeting'),
        );
      }),
      fake,
    );
  });

  it('refuses a folder that does not exist, and an unknown project or session', async () => {
    const fake = makeFakeHarness();
    await run(
      Effect.gen(function* () {
        const engine = yield* Engine;
        const missing = yield* Effect.flip(
          engine.addProject('/no/such/folder/here'),
        );
        expect(missing._tag).toBe('FolderNotFound');
        expect((yield* Effect.flip(engine.send('nope', say('x'))))._tag).toBe(
          'SessionNotFound',
        );
        expect((yield* Effect.flip(engine.removeProject('nope')))._tag).toBe(
          'ProjectNotFound',
        );
      }),
      fake,
    );
  });

  it('starts a session under the id the App chose, and asked again with it, starts nothing new', async () => {
    const fake = makeFakeHarness();
    await run(
      Effect.gen(function* () {
        const engine = yield* Engine;
        const store = yield* Store;
        const project = yield* engine.addProject(folder());
        const ask = {
          id: '01J0Z8Q3VQ4N7Y2K5R6T8W9XAB',
          projectId: project.id,
          account: 'claude',
          model: 'claude-test',
          settings: {},
          text: 'hello',
          attachments: [],
        };
        const first = yield* engine.startSession(ask);
        expect(first.id).toBe(ask.id);
        yield* eventually(async () =>
          expect((await Effect.runPromise(store.session(ask.id)))?.status).toBe(
            'idle',
          ),
        );
        // Asked again: that one, as it is now, and nothing started.
        const again = yield* engine.startSession({ ...ask, text: 'twice' });
        expect(again).toMatchObject({ id: ask.id, status: 'idle' });
        const { items } = yield* store.sessions.after(null);
        expect(items.filter(({ value }) => value.id === ask.id)).toHaveLength(
          1,
        );
        const raws = yield* Effect.promise(() => rawsOf(store, ask.id));
        expect(raws.filter((raw) => raw.kind === 'turn.started')).toHaveLength(
          1,
        );
      }),
      fake,
    );
  });

  it('starts one session for two starts asked at once under one id, in one project or two', async () => {
    const fake = makeFakeHarness();
    await run(
      Effect.gen(function* () {
        const engine = yield* Engine;
        const store = yield* Store;
        const project = yield* engine.addProject(folder());
        const other = yield* engine.addProject(folder());
        const ask = {
          id: '01J0Z8Q3VQ4N7Y2K5R6T8W9XCD',
          projectId: project.id,
          account: 'claude',
          model: 'claude-test',
          settings: {},
          text: 'hello',
          attachments: [{ name: 'a.txt', mime: 'text/plain', data: btoa('a') }],
        };
        const [one, two, three] = yield* Effect.all(
          [
            engine.startSession(ask),
            engine.startSession(ask),
            engine.startSession({ ...ask, projectId: other.id }),
          ],
          { concurrency: 'unbounded' },
        );
        expect(one.id).toBe(ask.id);
        expect(two.id).toBe(ask.id);
        expect(three.id).not.toBe(ask.id);
        expect(three.projectId).toBe(other.id);
        const { items } = yield* store.sessions.after(null);
        expect(items.filter(({ value }) => value.id === ask.id)).toHaveLength(
          1,
        );
      }),
      fake,
    );
  });

  it('chooses its own id for one that is no ULID, or is another project’s session’s', async () => {
    const fake = makeFakeHarness();
    await run(
      Effect.gen(function* () {
        const engine = yield* Engine;
        const project = yield* engine.addProject(folder());
        const other = yield* engine.addProject(folder());
        const ask = {
          projectId: project.id,
          account: 'claude',
          model: 'claude-test',
          settings: {},
          text: 'hello',
          attachments: [],
        };
        const odd = yield* engine.startSession({ ...ask, id: '../../outside' });
        expect(odd.id).not.toBe('../../outside');
        expect(odd.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
        const elsewhere = yield* engine.startSession({
          ...ask,
          projectId: other.id,
          id: odd.id,
        });
        expect(elsewhere.id).not.toBe(odd.id);
        expect(elsewhere.projectId).toBe(other.id);
      }),
      fake,
    );
  });

  it('removing a project tombstones it and its sessions, and stops the running one', async () => {
    const fake = makeFakeHarness({ hold: true });
    await run(
      Effect.gen(function* () {
        const { engine, project, session, raws, store } = yield* started;
        const other = yield* engine.addProject(folder());
        const kept = yield* engine.startSession({
          projectId: other.id,
          account: 'claude',
          model: 'claude-test',
          settings: {},
          text: 'elsewhere',
          attachments: [],
        });
        yield* eventually(async () => expect(await raws()).toHaveLength(2));
        yield* engine.removeProject(project.id);
        yield* eventually(async () =>
          expect(await Effect.runPromise(store.project(project.id))).toBeNull(),
        );
        yield* eventually(() => expect(fake.closes()).toBe(1));
        expect(yield* store.session(session.id)).toBeNull();
        expect(yield* store.session(kept.id)).not.toBeNull();
        const { items } = yield* store.sessions.after(null);
        expect(
          items.find(({ value }) => value.id === session.id)?.meta._d,
        ).toBe(true);
        expect(yield* Effect.promise(raws)).toHaveLength(2);
        expect(
          (yield* Effect.flip(engine.send(session.id, say('x'))))._tag,
        ).toBe('SessionNotFound');
      }),
      fake,
    );
  });

  it('on start, ends what the last run left running interrupted, then Resumes it by native id', async () => {
    const path = join(folder(), 'ai.db');
    const fake = makeFakeHarness({ hold: true });
    const cut = await run(cutOff, fake, path);
    expect(fake.closes()).toBe(1);
    await run(
      Effect.gen(function* () {
        const store = yield* Store;
        const raws = () => rawsOf(store, cut.id);
        yield* eventually(async () => expect(await raws()).toHaveLength(5));
        const all = yield* Effect.promise(raws);
        // The stop wrote nothing: the sweep ends the Turn, then Resumes it.
        expect(all.map(brief)).toEqual([
          'engine turn.started {"text":"hello there\\nsecond line","steered":false}',
          'claude text {"text":"echo:hello there\\nsecond line"}',
          'engine turn.ended {"status":"interrupted"}',
          `engine turn.started ${JSON.stringify({ text: RESUME_PROMPT, steered: false, resumed: true })}`,
          `claude text ${JSON.stringify({ text: `echo:${RESUME_PROMPT}` })}`,
        ]);
        expect(all[2]?.turnId).toBe(all[0]?.turnId);
        expect(all[3]?.turnId).not.toBe(all[0]?.turnId);
        expect(fake.opens).toHaveLength(2);
        expect(fake.opens[1]?.nativeId).toBe('native-1');
        expect(fake.inputs.at(-1)?.text).toBe(RESUME_PROMPT);
        const saved = yield* store.session(cut.id);
        expect(saved).toMatchObject({ status: 'running', title: cut.title });
        expect(saved?.endedAt).toBe(all[2]?.at);
        expect(saved?.activeAt).toBeGreaterThanOrEqual(all[2]?.at ?? NaN);
        yield* fake.finish;
        yield* eventually(async () =>
          expect((await Effect.runPromise(store.session(cut.id)))?.status).toBe(
            'idle',
          ),
        );
      }),
      fake,
      path,
    );
  });

  it('a Resumed Turn cut off again is ended interrupted, and not Resumed again', async () => {
    const path = join(folder(), 'ai.db');
    const fake = makeFakeHarness({ hold: true });
    const cut = await run(cutOff, fake, path);
    // The next start Resumes it, and stops while the Resumed Turn runs.
    await run(
      Effect.gen(function* () {
        const store = yield* Store;
        yield* eventually(async () =>
          expect(await rawsOf(store, cut.id)).toHaveLength(5),
        );
      }),
      fake,
      path,
    );
    await run(
      Effect.gen(function* () {
        const store = yield* Store;
        yield* Effect.sleep('100 millis');
        expect((yield* store.session(cut.id))?.status).toBe('interrupted');
        const all = yield* Effect.promise(() => rawsOf(store, cut.id));
        expect(all.map(brief).slice(3)).toEqual([
          `engine turn.started ${JSON.stringify({ text: RESUME_PROMPT, steered: false, resumed: true })}`,
          `claude text ${JSON.stringify({ text: `echo:${RESUME_PROMPT}` })}`,
          'engine turn.ended {"status":"interrupted"}',
        ]);
        expect(fake.opens).toHaveLength(2);
      }),
      fake,
      path,
    );
  });

  it('a Turn cut off before its agent gave a native id is ended interrupted, and not Resumed', async () => {
    const path = join(folder(), 'ai.db');
    const fake = makeFakeHarness({ hold: true });
    const project = {
      id: 'p1',
      path: folder(),
      name: 'p1',
      createdAt: 1,
      folder: 'present' as const,
    };
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const store = yield* Store;
          yield* store.saveProject(project);
          yield* store.saveSession({
            id: 's1',
            projectId: project.id,
            harness: 'claude',
            account: 'claude',
            model: 'claude-test',
            settings: {},
            title: 'Hello',
            status: 'running',
            nativeId: null,
            createdAt: 1,
            forkedFrom: null,
            settledAt: null,
            activeAt: 1,
            endedAt: null,
            worktree: null,
            branch: null,
          });
          yield* store.appendRaw({
            id: 'r1',
            sessionId: 's1',
            turnId: 't1',
            harness: 'engine',
            kind: 'turn.started',
            agentId: null,
            payload: { text: 'hello', steered: false },
            at: 1,
          });
        }),
      ).pipe(Effect.provide(storeLayer(path))),
    );
    await run(
      Effect.gen(function* () {
        const store = yield* Store;
        yield* Effect.sleep('100 millis');
        expect((yield* store.session('s1'))?.status).toBe('interrupted');
        const all = yield* Effect.promise(() => rawsOf(store, 's1'));
        expect(all.map(brief)).toEqual([
          'engine turn.started {"text":"hello","steered":false}',
          'engine turn.ended {"status":"interrupted"}',
        ]);
        expect(fake.opens).toHaveLength(0);
      }),
      fake,
      path,
    );
  });

  it('the next start leaves a cancelled Turn and a failed one as they ended', async () => {
    const path = join(folder(), 'ai.db');
    const fake = makeFakeHarness({ hold: true });
    const before = await run(
      Effect.gen(function* () {
        const { engine, project, session, raws, status, store } =
          yield* started;
        yield* eventually(async () => expect(await raws()).toHaveLength(2));
        yield* engine.cancel(session.id);
        yield* eventually(async () => expect(await status()).toBe('cancelled'));
        const other = yield* engine.startSession({
          projectId: project.id,
          account: 'claude',
          model: 'claude-test',
          settings: {},
          text: 'another',
          attachments: [],
        });
        yield* eventually(async () =>
          expect(await rawsOf(store, other.id)).toHaveLength(2),
        );
        yield* fake.fail('boom');
        yield* eventually(async () =>
          expect(
            (await Effect.runPromise(store.session(other.id)))?.status,
          ).toBe('failed'),
        );
        return {
          cancelled: session.id,
          failed: other.id,
          raws: [
            yield* Effect.promise(raws),
            yield* Effect.promise(() => rawsOf(store, other.id)),
          ],
        };
      }),
      fake,
      path,
    );
    const opens = fake.opens.length;
    await run(
      Effect.gen(function* () {
        const store = yield* Store;
        yield* Effect.sleep('100 millis');
        expect((yield* store.session(before.cancelled))?.status).toBe(
          'cancelled',
        );
        expect((yield* store.session(before.failed))?.status).toBe('failed');
        expect([
          yield* Effect.promise(() => rawsOf(store, before.cancelled)),
          yield* Effect.promise(() => rawsOf(store, before.failed)),
        ]).toEqual(before.raws);
        expect(fake.opens).toHaveLength(opens);
        expect(fake.inputs.map(({ text }) => text)).not.toContain(
          RESUME_PROMPT,
        );
      }),
      fake,
      path,
    );
  });

  it('on start, removes the sessions a project removed earlier left behind, and only once', async () => {
    const path = join(folder(), 'ai.db');
    const session = {
      harness: 'claude' as const,
      account: 'claude',
      model: 'claude-test',
      settings: {},
      title: 'Hello',
      status: 'idle' as const,
      nativeId: null,
      createdAt: 1,
      forkedFrom: null,
      settledAt: null,
      activeAt: 1,
      endedAt: null,
      worktree: null,
      branch: null,
    };
    /** Each removed Session's id and when it was last written. */
    const removed = (store: Store['Service']) =>
      Effect.map(store.sessions.after(null), ({ items }) =>
        items.flatMap(({ value, meta }) =>
          meta._d ? [[value.id, meta._u]] : [],
        ),
      );
    // As a removal before Sessions went with their Project left them.
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const store = yield* Store;
          yield* store.saveProject({
            id: 'p1',
            path: folder(),
            name: 'a',
            createdAt: 1,
            folder: 'present',
          });
          yield* store.saveProject({
            id: 'p2',
            path: folder(),
            name: 'b',
            createdAt: 1,
            folder: 'present',
          });
          yield* store.removeProject('p2');
          yield* store.saveSession({ ...session, id: 's1', projectId: 'p1' });
          yield* store.saveSession({ ...session, id: 's2', projectId: 'p2' });
        }),
      ).pipe(Effect.provide(storeLayer(path))),
    );
    const fake = makeFakeHarness();
    const swept = await run(
      Effect.gen(function* () {
        const engine = yield* Engine;
        const store = yield* Store;
        expect((yield* store.allSessions).map(({ id }) => id)).toEqual(['s1']);
        const now = yield* removed(store);
        expect(now.map(([id]) => id)).toEqual(['s2']);
        expect((yield* Effect.flip(engine.send('s2', say('x'))))._tag).toBe(
          'SessionNotFound',
        );
        return now;
      }),
      fake,
      path,
    );
    await run(
      Effect.gen(function* () {
        expect(yield* removed(yield* Store)).toEqual(swept);
      }),
      fake,
      path,
    );
  });
});
