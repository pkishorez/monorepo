import { Effect, Exit, Fiber, Schema, Stream } from 'effect';
import type { Scope } from 'effect';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Actor, Address, History } from '@kestack/kabuki';
import type { AppRuntime } from '@kestack/kabuki/react/types';
import { Blueprinted, Graph, Node, Trail } from '../../api/index.ts';
import { inMemory } from '../index.ts';
import { changesAt, graphAt } from '../answers/views.ts';
import { started } from './app.ts';

/* The Kabuki Session Api answered by a running Diary, through the in-memory client. */

const run = <A, E>(effect: Effect.Effect<A, E, Scope.Scope>) =>
  Effect.runPromise(Effect.scoped(effect));

const settle = Effect.gen(function* () {
  for (let i = 0; i < 10; i++) yield* Effect.yieldNow;
});

/** The Diary with two notes written, and a client on it. */
const written = Effect.gen(function* () {
  const app = yield* started;
  app.write('first', 5);
  app.write('second', 9);
  yield* settle;
  const client = yield* inMemory(app.app);
  return { ...app, client };
});

const failure = <A, E>(exit: Exit.Exit<A, E>) =>
  Exit.isFailure(exit) ? exit.cause.reasons[0] : undefined;

describe('answers', () => {
  it('says who the Kabuki Session is, and takes the name DevTools gives', () =>
    run(
      Effect.gen(function* () {
        const { client } = yield* written;
        expect((yield* client.info()).app).toBe('Diary');
        yield* client.named({ name: 'quiet-otter-2' });
        expect((yield* client.info()).name).toBe('quiet-otter-2');
      }),
    ));

  it('reads the History with each Message encoded, narrowed by last and since', () =>
    run(
      Effect.gen(function* () {
        const { client } = yield* written;
        const history = yield* client.history({});
        expect(history.entries).toHaveLength(2);
        expect(history.head).toBe(history.entries[1]!.id);
        expect(history.seeking).toBeNull();
        expect(history.running).toBe(true);
        expect(history.tips).toEqual([history.head]);
        expect(history.splits).toEqual([]);
        const [first] = history.entries;
        expect(first).toMatchObject({
          parent: null,
          to: 'Diary',
          tag: 'Wrote',
          from: { kind: 'outside' },
          outcome: 'handled',
          message: {
            _tag: 'Wrote',
            note: { at: new Date(5).toISOString(), text: 'first' },
          },
        });
        const last = yield* client.history({ last: 1 });
        expect(last.entries.map(({ id }) => id)).toEqual([history.head]);
        const since = yield* client.history({ since: first!.id });
        expect(since.entries.map(({ id }) => id)).toEqual([history.head]);
      }),
    ));

  it('reads the Snapshot at a Step, by a dot path, encoded', () =>
    run(
      Effect.gen(function* () {
        const { client } = yield* written;
        const now = yield* client.snapshot({ path: 'model.notes.1' });
        expect(now.value).toEqual({
          at: new Date(9).toISOString(),
          text: 'second',
        });
        expect(now.summarized).toBe(false);
        const init = yield* client.snapshot({ at: 'init', path: 'model' });
        expect(init).toMatchObject({ at: 'init', value: { notes: [] } });
        const whole = yield* client.snapshot({});
        expect(whole.value).toMatchObject({
          address: 'Diary',
          started: null,
          children: {
            counter: { address: 'Diary/counter#1', model: { count: 0 } },
          },
        });
      }),
    ));

  it('says which keys there are where a path stops, and which Steps are kept', () =>
    run(
      Effect.gen(function* () {
        const { client } = yield* written;
        const history = yield* client.history({});
        const lost = failure(
          yield* Effect.exit(client.snapshot({ path: 'model.notez' })),
        );
        expect(lost).toMatchObject({
          error: { _tag: 'PathNotFound', found: 'model', available: ['notes'] },
        });
        const gone = failure(yield* Effect.exit(client.snapshot({ at: 999 })));
        expect(gone).toMatchObject({
          error: {
            _tag: 'StepNotFound',
            step: 999,
            oldest: history.entries[0]!.id,
            newest: history.head,
          },
        });
      }),
    ));

  it('summarizes a large Snapshot unless expanded', () =>
    run(
      Effect.gen(function* () {
        const app = yield* started;
        for (let i = 0; i < 200; i++) app.write(`note ${i} `.repeat(4), i);
        yield* settle;
        const client = yield* inMemory(app.app);
        const folded = yield* client.snapshot({ path: 'model' });
        expect(folded.summarized).toBe(true);
        const { notes } = folded.value as { notes: unknown[] };
        expect(notes).toHaveLength(21);
        expect(notes.at(-1)).toBe('… 180 more items');
        const expanded = yield* client.snapshot({
          path: 'model',
          expand: true,
        });
        expect(expanded.summarized).toBe(false);
        expect((expanded.value as { notes: unknown[] }).notes).toHaveLength(
          200,
        );
      }),
    ));

  it('tells what one Step changed, as Kabuki marks it, its values and diff encoded', () =>
    run(
      Effect.gen(function* () {
        const { client } = yield* written;
        const { head } = yield* client.history({});
        const changes = yield* client.changes({ step: head! });
        expect(changes.entry.id).toBe(head);
        expect(changes.commands).toEqual([]);
        expect(changes.changes).toEqual([
          expect.objectContaining({
            instance: 'Diary',
            kind: 'changed',
            actor: 'Diary',
            model: [
              {
                path: 'notes.1',
                from: undefined,
                to: { at: new Date(9).toISOString(), text: 'second' },
              },
            ],
          }),
        ]);
        const diff = changes.changes[0]!.diff!.model;
        expect(diff.some((row) => row.kind === 'added')).toBe(true);
      }),
    ));

  it('tells a Step that changed only a Child as that Child, not its parent', () =>
    run(
      Effect.gen(function* () {
        const { client, bump } = yield* written;
        bump();
        yield* settle;
        const { head } = yield* client.history({});
        const { entry, changes } = yield* client.changes({ step: head! });
        expect(entry).toMatchObject({ to: 'Diary/counter#1', tag: 'Bumped' });
        expect(changes).toEqual([
          expect.objectContaining({
            instance: 'Diary/counter#1',
            kind: 'changed',
            model: [{ path: 'count', from: 0, to: 1 }],
          }),
        ]);
      }),
    ));

  it('tells which Workers a Step started and stopped, from the data before and after it', () => {
    const Uploads = Actor.define('Uploads', {
      model: { ids: Schema.Array(Schema.String), paused: Schema.Boolean },
      message: { Added: { id: Schema.String }, Paused: {} },
    }).build({
      init: () => ({ model: { ids: [], paused: false } }),
      on: {
        Added: ({ id }, { model }) => ({ model: { ids: [...model.ids, id] } }),
        Paused: () => ({ model: { ids: [], paused: true } }),
      },
      workers: {
        upload: { each: ({ model }) => model.ids, run: () => Effect.never },
        nap: { while: ({ model }) => model.paused, run: () => Effect.never },
      },
    });
    let history = History.make({});
    const send = (message: { readonly _tag: string; readonly id?: string }) => {
      const grown = History.add(history, {
        to: Address.check(Uploads, 'Uploads')!,
        message,
        from: { kind: 'outside' },
        at: 0,
      });
      history = grown.history;
      return grown.entry;
    };
    send({ _tag: 'Added', id: 'a' });
    const added = send({ _tag: 'Added', id: 'b' });
    const paused = send({ _tag: 'Paused' });
    expect(changesAt(Uploads, history, added).changes).toEqual([
      expect.objectContaining({ started: ['upload#b'], stopped: [] }),
    ]);
    expect(changesAt(Uploads, history, paused).changes).toEqual([
      expect.objectContaining({
        started: ['nap'],
        stopped: ['upload#a', 'upload#b'],
      }),
    ]);
    expect(graphAt(Uploads, history, paused.id).change).toMatchObject({
      started: ['nap'],
      stopped: ['upload#a', 'upload#b'],
    });
  });

  it('draws the graph at a Step as plain data the Schema takes', () =>
    run(
      Effect.gen(function* () {
        const { client } = yield* written;
        const graph = yield* client.graph({});
        expect(graph.root).toMatchObject({
          id: 'Diary',
          actor: 'Diary',
          condition: null,
          took: { message: 'Wrote', outcome: 'handled', commands: [] },
          change: { kind: 'changed', model: ['notes.1'] },
        });
        expect(graph.root.blueprint.top.children).toEqual([
          {
            name: 'counter',
            actor: 'Counter',
            condition: 'always',
            keyed: false,
          },
        ]);
        // At the Head of a Live app, the Runtime says which Workers run.
        expect(graph.root.workers).toEqual([]);
        const [counter] = graph.root.children;
        expect(counter).toMatchObject({
          id: 'Diary/counter#1',
          actor: 'Counter',
          title: 'counter',
          condition: 'always',
          within: null,
        });
        expect(counter!.change).toBeUndefined();
        const encoded = Schema.encodeSync(Graph)(graph);
        expect(JSON.parse(JSON.stringify(encoded))).toEqual(encoded);
      }),
    ));

  it("reads the Blueprint from the root's: every Actor by its place, no Instance", () =>
    run(
      Effect.gen(function* () {
        const { client } = yield* written;
        const { root } = yield* client.blueprint();
        expect(root).toMatchObject({
          id: 'Diary',
          actor: 'Diary',
          title: 'Diary',
          condition: null,
          state: null,
          blueprint: { single: true, requires: [] },
        });
        expect(root.key).toBeUndefined();
        expect(root.change).toBeUndefined();
        expect(root.blueprint.top.on).toEqual(['Wrote']);
        expect(root.children).toEqual([
          expect.objectContaining({
            id: 'Diary/counter',
            actor: 'Counter',
            condition: 'always',
            within: null,
            children: [],
          }),
        ]);
        const encoded = Schema.encodeSync(Blueprinted)({ root });
        expect(JSON.parse(JSON.stringify(encoded))).toEqual(encoded);
      }),
    ));

  it('draws the graph at an entry off the Branch, after a fork, as its changes tell it', () =>
    run(
      Effect.gen(function* () {
        const { client, write } = yield* written;
        const [first, second] = (yield* client.history({})).entries;
        yield* client.fork({ from: first!.id });
        yield* settle;
        write('third', 12);
        yield* settle;
        const { entries } = yield* client.history({});
        expect(entries.map(({ id }) => id)).not.toContain(second!.id);
        const graph = yield* client.graph({ at: second!.id });
        expect(graph.root).toMatchObject({
          took: { message: 'Wrote', outcome: 'handled', commands: [] },
          change: { kind: 'changed', model: ['notes.1'] },
        });
        const { changes } = yield* client.changes({ step: second!.id });
        expect(changes[0]).toMatchObject({ kind: 'changed' });
      }),
    ));

  it('shows one card: its data, change and Schemas', () =>
    run(
      Effect.gen(function* () {
        const { client } = yield* written;
        const node = yield* client.node({ instance: 'Diary' });
        expect(node).toMatchObject({
          id: 'Diary',
          state: { _tag: 'Single' },
          provides: { top: [], state: [] },
          workers: [],
          status: [],
        });
        expect(node.model).toEqual({
          notes: [
            { at: new Date(5).toISOString(), text: 'first' },
            { at: new Date(9).toISOString(), text: 'second' },
          ],
        });
        expect(Object.keys(node.schemas.messages)).toEqual(['Wrote']);
        expect(node.schemas.model).toMatchObject({ kind: 'struct' });
        expect(node.change).toMatchObject({ kind: 'changed' });
        const encoded = Schema.encodeSync(Node)(node);
        expect(JSON.parse(JSON.stringify(encoded))).toEqual(encoded);
        const missing = failure(
          yield* Effect.exit(client.node({ instance: 'Diary/nope' })),
        );
        expect(missing).toMatchObject({
          error: {
            _tag: 'InstanceNotFound',
            available: ['Diary', 'Diary/counter#1'],
          },
        });
      }),
    ));

  it('Seeks a Step in the app, init too, and its Head again, and Forks the same Runtime to an entry', () =>
    run(
      Effect.gen(function* () {
        const { client, app, runtime } = yield* written;
        const [first] = (yield* client.history({})).entries;
        yield* client.seek({ step: first!.id });
        expect(app.seeking?.entry).toBe(first!.id);
        expect((yield* client.history({})).seeking).toBe(first!.id);
        yield* client.seek({ step: 'init' });
        expect(app.seeking).toMatchObject({ entry: null, at: 0 });
        expect((yield* client.history({})).seeking).toBe('init');
        yield* client.seek({ step: null });
        expect(app.seeking).toBeNull();
        const gone = failure(yield* Effect.exit(client.seek({ step: 999 })));
        expect(gone).toMatchObject({ error: { _tag: 'StepNotFound' } });
        yield* client.fork({ from: first!.id });
        yield* settle;
        expect(app.runtime).toBe(runtime);
        expect(runtime.history.head).toBe(first!.id);
        expect((yield* client.history({})).entries).toHaveLength(1);
      }),
    ));

  it('reads any Branch, where the one asked for splits, and a Trail along it', () =>
    run(
      Effect.gen(function* () {
        const { client, write } = yield* written;
        const [first, second] = (yield* client.history({})).entries;
        yield* client.fork({ from: first!.id });
        yield* settle;
        write('third', 12);
        yield* settle;
        const head = yield* client.history({});
        const third = head.entries[1]!;
        expect(head.entries.map(({ id }) => id)).toEqual([first!.id, third.id]);
        expect(head.tips).toEqual([second!.id, third.id]);
        expect(
          head.splits.map(({ at, next }) => [at, next.map(({ id }) => id)]),
        ).toEqual([[first!.id, [second!.id, third.id]]]);
        // The Branch through an entry; the Head's when it passes through it.
        const old = yield* client.history({ branch: second!.id });
        expect(old.entries.map(({ id }) => id)).toEqual([
          first!.id,
          second!.id,
        ]);
        expect(
          (yield* client.history({ branch: first!.id })).entries.at(-1)?.id,
        ).toBe(third.id);
        const trail = yield* client.trail({
          instance: 'Diary',
          branch: second!.id,
        });
        expect(trail.moments.map(({ entry }) => entry?.id ?? null)).toEqual([
          null,
          first!.id,
          second!.id,
        ]);
        const gone = failure(
          yield* Effect.exit(client.history({ branch: 999 })),
        );
        expect(gone).toMatchObject({ error: { _tag: 'StepNotFound' } });
        // Forked back to init, the Head's Branch is empty and goes on two ways.
        yield* client.fork({ from: null });
        yield* settle;
        const empty = yield* client.history({});
        expect(empty.entries).toEqual([]);
        expect(empty.splits).toMatchObject([{ at: 'init' }]);
      }),
    ));

  it('says when the app is stopped, and running again', () =>
    run(
      Effect.gen(function* () {
        const { client, runtime } = yield* written;
        yield* Effect.promise(() => runtime.stop());
        expect((yield* client.history({})).running).toBe(false);
        yield* Effect.promise(() => runtime.start());
        expect((yield* client.history({})).running).toBe(true);
      }),
    ));

  it("tells one Instance's Trail: when it started, each entry that changed it, each it only received", () =>
    run(
      Effect.gen(function* () {
        const { client, bump } = yield* written;
        bump();
        yield* settle;
        const diary = yield* client.trail({ instance: 'Diary' });
        expect(diary.actor).toBe('Diary');
        expect(
          diary.moments.map(({ kind, entry }) => [kind, entry?.tag ?? null]),
        ).toEqual([
          ['started', null],
          ['changed', 'Wrote'],
          ['changed', 'Wrote'],
        ]);
        expect(diary.moments[2]).toMatchObject({
          entry: {
            to: 'Diary',
            outcome: 'handled',
            message: { note: { at: new Date(9).toISOString() } },
          },
          model: ['notes.1'],
          props: [],
        });
        const counter = yield* client.trail({ instance: 'Diary/counter#1' });
        expect(counter.moments.map(({ kind }) => kind)).toEqual([
          'started',
          'changed',
        ]);
        expect(counter.moments[1]).toMatchObject({ model: ['count'] });
        const encoded = Schema.encodeSync(Trail)(counter);
        expect(JSON.parse(JSON.stringify(encoded))).toEqual(encoded);
      }),
    ));

  it('tells a Trail empty for an Address no Instance had, and refuses one the Blueprint has no place for', () =>
    run(
      Effect.gen(function* () {
        const { client } = yield* written;
        const never = yield* client.trail({ instance: 'Diary/counter#2' });
        expect(never.moments).toEqual([]);
        const wrong = failure(
          yield* Effect.exit(client.trail({ instance: 'Diary/nope#1' })),
        );
        expect(wrong).toMatchObject({
          error: {
            _tag: 'InstanceNotFound',
            available: ['Diary', 'Diary/counter#1'],
          },
        });
      }),
    ));

  it('waits for a Runtime the app does not have yet', () =>
    run(
      Effect.gen(function* () {
        const { app } = yield* started;
        let runtime: AppRuntime['runtime'] = null;
        const listeners = new Set<() => void>();
        const later: AppRuntime = {
          ...app,
          get runtime() {
            return runtime;
          },
          subscribe: (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
          },
        };
        const client = yield* inMemory(later);
        const asked = yield* client.history({}).pipe(Effect.forkScoped);
        yield* settle;
        expect(asked.pollUnsafe()).toBeUndefined();
        runtime = app.runtime;
        for (const listener of listeners) listener();
        const { entries } = yield* Fiber.join(asked);
        expect(entries).toEqual([]);
      }),
    ));

  it('watches the app: where it is now, then after each change', () =>
    run(
      Effect.gen(function* () {
        const { client, write } = yield* written;
        const seen: Array<{ size: number; revision: number }> = [];
        const fiber = yield* client.watch().pipe(
          Stream.runForEach((now) => Effect.sync(() => seen.push(now))),
          Effect.forkScoped,
        );
        yield* settle;
        expect(seen[0]).toMatchObject({ size: 2, revision: 0 });
        write('third', 12);
        yield* settle;
        expect(seen.at(-1)!.size).toBe(3);
        expect(seen.at(-1)!.revision).toBeGreaterThan(0);
        yield* Fiber.interrupt(fiber);
      }),
    ));

  it('says the page the app is on, then each other page it moves to', () =>
    run(
      Effect.gen(function* () {
        const page = { href: 'http://localhost:5173/' };
        vi.stubGlobal('location', page);
        const { client, write } = yield* written;
        const seen: Array<string> = [];
        const fiber = yield* client.page().pipe(
          Stream.runForEach((url) => Effect.sync(() => seen.push(url))),
          Effect.forkScoped,
        );
        yield* settle;
        page.href = 'http://localhost:5173/items/1';
        write('third', 12);
        yield* Effect.sleep('5 millis');
        write('fourth', 14);
        yield* Effect.sleep('5 millis');
        expect(seen).toEqual([
          'http://localhost:5173/',
          'http://localhost:5173/items/1',
        ]);
        yield* Fiber.interrupt(fiber);
      }),
    ));
});

afterEach(() => {
  vi.unstubAllGlobals();
});
