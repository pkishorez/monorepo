import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Effect, Layer, type Scope } from 'effect';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeFakeHarness, type FakeHarness } from '../fake-harness/index.js';
import type { Raw } from '../raw/index.js';
import { Store } from '../store/index.js';
import { Engine } from './index.js';

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
  const base = Layer.merge(Store.layer(path), fake.layer);
  return Layer.merge(
    base,
    Engine.layer({ attachments: folder() }).pipe(Layer.provide(base)),
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
    harness: 'claude',
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
      }),
      fake,
    );
  });

  it('a cancel ends the turn cancelled, and the session stays cancelled', async () => {
    const fake = makeFakeHarness({ hold: true });
    await run(
      Effect.gen(function* () {
        const { raws, status, session, engine } = yield* started;
        yield* eventually(async () => expect(await raws()).toHaveLength(2));
        yield* engine.cancel(session.id);
        yield* eventually(async () => expect(await status()).toBe('cancelled'));
        expect((yield* Effect.promise(raws)).map(brief).at(-1)).toBe(
          'engine turn.ended {"status":"cancelled"}',
        );
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

  it('titles a session with the Titler, or keeps the first line', async () => {
    const fake = makeFakeHarness({ title: 'A greeting' });
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

  it('removing a project tombstones it and stops its sessions', async () => {
    const fake = makeFakeHarness({ hold: true });
    await run(
      Effect.gen(function* () {
        const { engine, project, session, raws, store } = yield* started;
        yield* eventually(async () => expect(await raws()).toHaveLength(2));
        yield* engine.removeProject(project.id);
        yield* eventually(async () =>
          expect(await Effect.runPromise(store.project(project.id))).toBeNull(),
        );
        yield* eventually(() => expect(fake.closes()).toBe(1));
        expect(yield* Effect.promise(raws)).toHaveLength(2);
        expect(
          (yield* Effect.flip(engine.send(session.id, say('x'))))._tag,
        ).toBe('SessionNotFound');
      }),
      fake,
    );
  });

  it('on start, marks what the last run left running interrupted, and resumes by native id', async () => {
    const path = join(folder(), 'ai.db');
    const fake = makeFakeHarness({ hold: true });
    // A session cut off mid-turn, as a crash leaves it.
    const cut = await run(
      Effect.gen(function* () {
        const { session, store } = yield* started;
        yield* eventually(async () =>
          expect(
            (await Effect.runPromise(store.session(session.id)))?.nativeId,
          ).toBe('native-1'),
        );
        return session;
      }),
      fake,
      path,
    );
    await run(
      Effect.gen(function* () {
        const engine = yield* Engine;
        const store = yield* Store;
        const saved = yield* store.session(cut.id);
        expect(saved?.status).toBe('interrupted');
        const all = yield* Effect.promise(() => rawsOf(store, cut.id));
        expect(all.map(brief).at(-1)).toBe(
          'engine turn.ended {"status":"interrupted"}',
        );
        expect(fake.opens).toHaveLength(1);
        expect(all.at(-1)?.turnId).toBe(all[0]?.turnId);
        yield* engine.send(cut.id, say('back again'));
        yield* eventually(() => expect(fake.opens).toHaveLength(2));
        expect(fake.opens[1]?.nativeId).toBe('native-1');
      }),
      fake,
      path,
    );
  });

  it('a server stopping mid-turn writes nothing; the next start finds it interrupted', async () => {
    const path = join(folder(), 'ai.db');
    const fake = makeFakeHarness({ hold: true });
    const cut = await run(
      Effect.gen(function* () {
        const { session, raws } = yield* started;
        yield* eventually(async () => expect(await raws()).toHaveLength(2));
        return session;
      }),
      fake,
      path,
    );
    expect(fake.closes()).toBe(1);
    await run(
      Effect.gen(function* () {
        const store = yield* Store;
        expect((yield* store.session(cut.id))?.status).toBe('interrupted');
        const all = yield* Effect.promise(() => rawsOf(store, cut.id));
        expect(all.map(brief).slice(1)).toEqual([
          'claude text {"text":"echo:hello there\\nsecond line"}',
          'engine turn.ended {"status":"interrupted"}',
        ]);
        expect(fake.opens).toHaveLength(1);
      }),
      fake,
      path,
    );
  });
});
