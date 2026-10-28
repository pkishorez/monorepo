import { Effect, Exit, Fiber, Schema, Stream } from 'effect';
import type { Scope } from 'effect';
import { describe, expect, it } from 'vitest';
import { Graph, Node } from '../../api/index.ts';
import { inMemory } from '../index.ts';
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
  const client = yield* inMemory(app.runtime);
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
        expect(history.shown).toBeNull();
        expect(history.running).toBe(true);
        const [first] = history.entries;
        expect(first).toMatchObject({
          parent: null,
          destination: 'Diary',
          tag: 'Wrote',
          source: { kind: 'outside' },
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
          id: 'Diary',
          children: { counter: { model: { count: 0 } } },
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
        const client = yield* inMemory(app.runtime);
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

  it('tells what one Step changed, its values and diff encoded', () =>
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
        expect(graph.root.touched.map(({ kind }) => kind)).toEqual([
          'changed',
          'changed',
        ]);
        const [counter] = graph.root.children;
        expect(counter).toMatchObject({ actor: 'Counter', title: 'counter' });
        const encoded = Schema.encodeSync(Graph)(graph);
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
          error: { _tag: 'InstanceNotFound', available: expect.any(Array) },
        });
      }),
    ));

  it('travels the app to a Step and back, and forks from an entry', () =>
    run(
      Effect.gen(function* () {
        const { client, runtime } = yield* written;
        const [first] = (yield* client.history({})).entries;
        yield* client.travel({ step: first!.id });
        expect(runtime.shown).toBe(first!.id);
        yield* client.travel({ step: null });
        expect(runtime.shown).toBeNull();
        const gone = failure(yield* Effect.exit(client.travel({ step: 999 })));
        expect(gone).toMatchObject({ error: { _tag: 'StepNotFound' } });
        yield* client.fork({ from: first!.id });
        yield* settle;
        expect(runtime.head).toBe(first!.id);
        expect(runtime.branch).toHaveLength(1);
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
});
