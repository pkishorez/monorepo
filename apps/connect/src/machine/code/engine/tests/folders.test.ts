import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Effect, Layer, Stream, type Scope } from 'effect';
import { TestClock } from 'effect/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  makeFakeHarness,
  type FakeHarness,
} from '@kestack/ai-toolkit/harness/fake';
import { EVERY } from '../actor-code/folders.js';
import { Engine, Store, storeLayer } from '../index.js';

/* The Folder Check: a Project knows whether its folder is there. */

const folders: Array<string> = [];
const folder = () => {
  const made = mkdtempSync(join(tmpdir(), 'ai-folders-'));
  folders.push(made);
  return made;
};
afterEach(() => {
  for (const made of folders.splice(0))
    rmSync(made, { recursive: true, force: true });
});

const run = <A, E>(
  effect: Effect.Effect<A, E, Engine | Store | Scope.Scope>,
  options: {
    readonly path?: string;
    readonly fake?: FakeHarness;
    readonly testClock?: boolean;
  } = {},
) => {
  const fake = options.fake ?? makeFakeHarness();
  const base = Layer.merge(storeLayer(options.path ?? ':memory:'), fake.layer);
  const world = Layer.merge(
    base,
    Engine.layer({ attachments: folder(), home: folder() }).pipe(
      Layer.provide(base),
    ),
  );
  return Effect.runPromise(
    Effect.scoped(effect).pipe(
      Effect.provide(world),
      Effect.provide(options.testClock ? TestClock.layer() : Layer.empty),
    ),
  );
};

const eventually = (assertion: () => Promise<void> | void) =>
  Effect.promise(() => vi.waitFor(assertion, { timeout: 3000, interval: 10 }));

/** A Project's folder as the Store holds it. */
const folderOf = (id: string) =>
  Effect.flatMap(Store, (store) =>
    Effect.map(store.project(id), (project) => project?.folder),
  );

/** How many times a Project is written from now on. */
const writesOf = (id: string) =>
  Effect.gen(function* () {
    const changes = yield* (yield* Store).projects.changes;
    let count = 0;
    yield* Effect.forkScoped(
      Stream.runForEach(changes, ({ value }) =>
        Effect.sync(() => {
          if (value.id === id) count += 1;
        }),
      ),
    );
    return () => count;
  });

describe('the Folder Check', () => {
  it('on start, marks a Project whose folder is gone missing, and leaves one there unwritten', async () => {
    const path = join(folder(), 'ai.db');
    const gone = join(folder(), 'gone');
    mkdirSync(gone);
    const kept = folder();
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const store = yield* Store;
          for (const [id, at] of [
            ['p1', gone],
            ['p2', kept],
          ] as const)
            yield* store.saveProject({
              id,
              path: at,
              name: id,
              createdAt: 1,
              folder: 'present',
            });
        }),
      ).pipe(Effect.provide(storeLayer(path))),
    );
    rmSync(gone, { recursive: true });
    const before = await Effect.runPromise(
      Effect.scoped(
        Effect.flatMap(Store, (store) => store.projects.after(null)),
      ).pipe(Effect.provide(storeLayer(path))),
    );
    await run(
      Effect.gen(function* () {
        const store = yield* Store;
        yield* eventually(async () =>
          expect((await Effect.runPromise(store.project('p1')))?.folder).toBe(
            'missing',
          ),
        );
        const { items } = yield* store.projects.after(null);
        const p2 = (all: typeof items) =>
          all.find(({ value }) => value.id === 'p2')?.meta._u;
        expect(p2(items)).toBe(p2(before.items));
      }),
      { path },
    );
  });

  it('every minute, marks a folder gone missing and one back present, writing only on a change', async () => {
    await run(
      Effect.gen(function* () {
        const engine = yield* Engine;
        const at = folder();
        const project = yield* engine.addProject(at);
        expect(project.folder).toBe('present');
        const writes = yield* writesOf(project.id);
        const tick = Effect.andThen(
          TestClock.adjust(EVERY),
          Effect.promise(() => new Promise((done) => setTimeout(done, 50))),
        );

        yield* tick;
        expect(yield* folderOf(project.id)).toBe('present');
        expect(writes()).toBe(0);

        rmSync(at, { recursive: true });
        yield* tick;
        expect(yield* folderOf(project.id)).toBe('missing');
        yield* tick;
        expect(writes()).toBe(1);

        mkdirSync(at);
        yield* tick;
        expect(yield* folderOf(project.id)).toBe('present');
        yield* tick;
        expect(writes()).toBe(2);
      }),
      { testClock: true },
    );
  });

  it('marks it missing at once when a Turn fails in a folder gone', async () => {
    const fake = makeFakeHarness({ hold: true });
    await run(
      Effect.gen(function* () {
        const engine = yield* Engine;
        const store = yield* Store;
        const at = folder();
        const project = yield* engine.addProject(at);
        const session = yield* engine.startSession({
          projectId: project.id,
          account: 'claude',
          model: 'claude-test',
          settings: {},
          text: 'hello',
          attachments: [],
        });
        yield* eventually(async () =>
          expect(
            (await Effect.runPromise(store.raws(session.id).after(null))).items,
          ).toHaveLength(2),
        );
        rmSync(at, { recursive: true });
        yield* fake.fail('gone');
        yield* eventually(async () =>
          expect(
            (await Effect.runPromise(store.project(project.id)))?.folder,
          ).toBe('missing'),
        );
      }),
      { fake },
    );
  });
});
