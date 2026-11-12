import { Effect, Layer, Queue, Stream } from 'effect';
import type { Scope } from 'effect';
import { TestClock } from 'effect/testing';
import { Runtime } from '@kestack/kabuki';
import type { Instance } from '@kestack/kabuki';
import { describe, expect, it } from 'vitest';
import type * as Api from '../../../api/index.ts';
import type { KabukiSessionClient } from '../../../api/index.ts';
import { KabukiSession } from '../../kabuki-session/index.ts';
import { InspectorLive } from '../index.ts';

/*
 * The Inspector on a Kabuki Session stood in for: it shows where the app
 * is as it is told, draws the Step shown, and moves the app only through
 * the Api. With Travel the app on, picking a Step Seeks it in the app and
 * Fork moves the app's Head to it; off, the Inspector looks back on its
 * own. Playing steps through each Step in turn and shows the Head at the
 * last. Where the History splits, an entry picked brings its Branch into
 * view. Zoomed in on one Instance, its Trail shows, and a moment picked
 * Seeks it.
 */

type Client = KabukiSessionClient;

const entry = (id: number, to = 'Counter'): Api.Entry => ({
  id,
  parent: id === 1 ? null : id - 1,
  to,
  message: { _tag: 'Bumped' },
  tag: 'Bumped',
  from: { kind: 'view', instance: to },
  at: id,
  outcome: 'handled',
});

const root: Api.GraphNode = {
  id: 'Counter',
  title: 'Counter',
  actor: 'Counter',
  blueprint: {
    name: 'Counter',
    single: true,
    requires: [],
    top: {
      on: ['Bumped'],
      workers: [],
      children: [],
      queries: [],
      provides: [],
    },
    state: {},
  },
  condition: null,
  keyed: false,
  within: null,
  state: 'Single',
  workers: [],
  gone: [],
  children: [],
};

const nowOf = (
  revision: number,
  seeking: Api.Step | null = null,
  head = 3,
): Api.Now => ({
  head,
  size: head,
  seeking,
  running: true,
  failure: null,
  revision,
});

/** The stand-in Kabuki Session, and everything it was asked. */
const session = Effect.gen(function* () {
  const nows = yield* Queue.unbounded<Api.Now>();
  const asked: Array<readonly [string, unknown]> = [];
  const entries = [entry(1), entry(2), entry(3, 'Counter/page#1')];
  // Another Branch, from 1: 4 after it.
  const other = { ...entry(4), parent: 1 };
  const ask = <A>(name: string, payload: unknown, answer: A) =>
    Effect.sync(() => {
      asked.push([name, payload]);
      return answer;
    });
  // An RPC client's procedures are generic over how they are called; a
  // stand-in answers the one way the Inspector calls them.
  const layer = Layer.mock(KabukiSession)({
    watch: (() => Stream.fromQueue(nows)) as unknown as Client['watch'],
    history: ((payload: { readonly branch?: number }) =>
      ask('history', payload, {
        entries: payload.branch === 4 ? [entries[0]!, other] : entries,
        splits: [{ at: 1, next: [entries[1]!, other] }],
        tips: [3, 4],
        head: 3,
        size: 3,
        seeking: null,
        running: true,
        failure: null,
      })) as unknown as Client['history'],
    graph: ((payload: { readonly at?: Api.Step }) =>
      ask('graph', payload, {
        at: payload.at ?? 3,
        root,
      })) as unknown as Client['graph'],
    blueprint: (() =>
      ask('blueprint', undefined, { root })) as unknown as Client['blueprint'],
    node: ((payload: { readonly instance: string }) =>
      ask('node', payload, {
        id: payload.instance,
        actor: 'Counter',
        at: 3,
        state: { _tag: 'Single' },
        model: { count: 3 },
        workers: [],
        status: [],
        provides: { top: [], state: [] },
        schemas: { states: {}, messages: {} },
      })) as unknown as Client['node'],
    trail: ((payload: { readonly instance: string }) =>
      ask('trail', payload, {
        instance: payload.instance,
        actor: 'Page',
        moments: [
          { entry: null, kind: 'started', model: [], props: [] },
          { entry: entries[2]!, kind: 'changed', model: ['count'], props: [] },
        ],
      } satisfies Api.Trail)) as unknown as Client['trail'],
    seek: ((payload: unknown) =>
      ask('seek', payload, undefined)) as unknown as Client['seek'],
    fork: ((payload: unknown) =>
      ask('fork', payload, undefined)) as unknown as Client['fork'],
  });
  return { layer, nows, asked };
});

const walk = (at: Instance): ReadonlyArray<Instance> => [
  at,
  ...Object.values(at.children).flatMap((child) =>
    ((Array.isArray(child) ? child : [child]) as Array<Instance>).flatMap(walk),
  ),
];

// oxlint-disable-next-line typescript/no-explicit-any -- any Runtime the test makes
type App = Runtime<any>;

const find = (app: App, actor: string) =>
  walk(app.snapshot.root).find((one) => one.actor === actor)!;

const settle = Effect.gen(function* () {
  for (let at = 0; at < 30; at++) yield* Effect.yieldNow;
});

const run = <A>(effect: Effect.Effect<A, never, Scope.Scope>) =>
  Effect.runPromise(
    Effect.scoped(effect).pipe(Effect.provide(TestClock.layer())),
  );

/** The Inspector on the stand-in, told the app is at its Head. */
const inspect = (travel: boolean) =>
  Effect.gen(function* () {
    const { layer, nows, asked } = yield* session;
    const app: App = yield* Runtime.scoped(InspectorLive, {
      window: null,
      input: { travel, look: { presenting: false, place: 'bottom' } },
      layer,
    });
    yield* Queue.offer(nows, nowOf(1));
    yield* settle;
    const send = (actor: string, message: unknown) =>
      Effect.andThen(
        Effect.sync(() => app.send(find(app, actor).address, message as never)),
        settle,
      );
    return { app, nows, asked, send };
  });

const asked = (all: ReadonlyArray<readonly [string, unknown]>, name: string) =>
  all.filter(([one]) => one === name).map(([, payload]) => payload);

describe('the Inspector', () => {
  it('shows where the Kabuki Session says the app is, its Head drawn', () =>
    run(
      Effect.gen(function* () {
        const { app, asked: all } = yield* inspect(true);
        const inspector = find(app, 'Inspector').model as {
          readonly now: Api.Now;
          readonly entries: ReadonlyArray<Api.Entry>;
        };
        expect(inspector.now.revision).toBe(1);
        expect(inspector.entries.map(({ id }) => id)).toEqual([1, 2, 3]);
        expect(find(app, 'Timeline').props).toMatchObject({
          at: null,
          ticks: [
            { id: 1, label: 'Bumped → Counter', tone: 'took' },
            { id: 2 },
            { id: 3, label: 'Bumped → page#1' },
          ],
        });
        expect(asked(all, 'graph')).toEqual([{}]);
        expect(find(app, 'Canvas').model).toMatchObject({
          graph: { root: { id: 'Counter' } },
        });
      }),
    ));

  it('Seeks a Step picked in the app, and draws it once the app Seeks it', () =>
    run(
      Effect.gen(function* () {
        const { app, nows, asked: all, send } = yield* inspect(true);
        yield* send('Timeline', { _tag: 'Picked', at: 2 });
        expect(asked(all, 'seek')).toEqual([{ step: 3 }]);
        yield* Queue.offer(nows, nowOf(2, 3));
        yield* settle;
        expect(asked(all, 'graph').at(-1)).toEqual({ at: 3 });
        expect(find(app, 'Timeline').props).toMatchObject({ at: 2 });
        // The card its Message was for opens, and is read at that Step.
        expect(find(app, 'Canvas').props).toMatchObject({
          opened: ['Counter/page#1'],
          bring: { id: 'Counter/page#1', key: 'step:3' },
        });
        expect(asked(all, 'node')).toEqual([
          { instance: 'Counter/page#1', at: 3 },
        ]);
      }),
    ));

  it('draws init, not the Head, while the app Seeks init, and forks from it', () =>
    run(
      Effect.gen(function* () {
        const { app, nows, asked: all, send } = yield* inspect(true);
        yield* Queue.offer(nows, nowOf(2, 'init'));
        yield* settle;
        expect(asked(all, 'graph').at(-1)).toEqual({ at: 'init' });
        expect(find(app, 'Timeline').props).toMatchObject({ at: -1 });
        yield* send('Timeline', { _tag: 'Forked' });
        expect(asked(all, 'fork')).toEqual([{ from: null }]);
      }),
    ));

  it('forks from the Step shown', () =>
    run(
      Effect.gen(function* () {
        const { nows, asked: all, send } = yield* inspect(true);
        yield* Queue.offer(nows, nowOf(2, 2));
        yield* settle;
        yield* send('Timeline', { _tag: 'Forked' });
        expect(asked(all, 'fork')).toEqual([{ from: 2 }]);
      }),
    ));

  it('looks back on its own with Travel the app off, and hands the Step over when switched on', () =>
    run(
      Effect.gen(function* () {
        const { app, asked: all, send } = yield* inspect(false);
        yield* send('Timeline', { _tag: 'Picked', at: 0 });
        expect(asked(all, 'seek')).toEqual([]);
        expect(asked(all, 'graph').at(-1)).toEqual({ at: 1 });
        expect(find(app, 'Timeline').props).toMatchObject({ at: 0 });
        yield* send('Timeline', { _tag: 'Travelled', travel: true });
        expect(asked(all, 'seek')).toEqual([{ step: 1 }]);
      }),
    ));

  it('keeps a card open the reader opened, read again as the app changes', () =>
    run(
      Effect.gen(function* () {
        const { app, nows, asked: all, send } = yield* inspect(true);
        yield* send('Canvas', { _tag: 'Opened', id: 'Counter', open: true });
        expect(find(app, 'Canvas').props).toMatchObject({
          opened: ['Counter'],
        });
        expect(find(app, 'Card').model).toMatchObject({
          node: { id: 'Counter', model: { count: 3 } },
        });
        yield* Queue.offer(nows, nowOf(2));
        yield* settle;
        expect(asked(all, 'node')).toHaveLength(2);
        yield* send('Canvas', { _tag: 'Opened', id: 'Counter', open: false });
        expect(find(app, 'Canvas').props).toMatchObject({ opened: [] });
      }),
    ));

  it('switches to the Blueprint, with no Timeline and cards of its own, and back', () =>
    run(
      Effect.gen(function* () {
        const { app, nows, asked: all, send } = yield* inspect(true);
        yield* send('Canvas', { _tag: 'Opened', id: 'Counter', open: true });
        yield* send('Inspector', { _tag: 'Viewed', view: 'blueprint' });
        expect(
          walk(app.snapshot.root).some((one) => one.actor === 'Timeline'),
        ).toBe(false);
        expect(find(app, 'Canvas').props).toMatchObject({
          blueprint: true,
          opened: [],
        });
        expect(find(app, 'Canvas').model).toMatchObject({
          print: { id: 'Counter' },
        });
        // A Blueprint card is no Instance: opening it reads nothing.
        yield* send('Canvas', { _tag: 'Opened', id: 'Counter', open: true });
        expect(find(app, 'Canvas').props).toMatchObject({
          opened: ['Counter'],
        });
        expect(asked(all, 'node')).toHaveLength(1);
        // Read once: it holds only what the Actors declare.
        yield* Queue.offer(nows, nowOf(2));
        yield* settle;
        expect(asked(all, 'blueprint')).toHaveLength(1);
        yield* send('Inspector', { _tag: 'Viewed', view: 'running' });
        expect(find(app, 'Timeline')).toBeDefined();
        expect(find(app, 'Canvas').props).toMatchObject({
          blueprint: false,
          opened: ['Counter'],
        });
      }),
    ));

  it('keeps how the Blueprint is shown, and lets go of the card picked when the Form changes', () =>
    run(
      Effect.gen(function* () {
        const { app, send } = yield* inspect(true);
        yield* send('Inspector', { _tag: 'Viewed', view: 'blueprint' });
        yield* send('Canvas', { _tag: 'Picked', id: 'Counter' });
        yield* send('Canvas', { _tag: 'Offed', off: 'hide' });
        expect(find(app, 'Canvas').model).toMatchObject({
          form: 'whole',
          off: 'hide',
          picked: 'Counter',
        });
        yield* send('Canvas', { _tag: 'Formed', form: 'steps' });
        expect(find(app, 'Canvas').model).toMatchObject({
          form: 'steps',
          off: 'hide',
          picked: null,
        });
      }),
    ));

  it("zooms in on an Instance's Trail from its card, in place of the canvas, and back out", () =>
    run(
      Effect.gen(function* () {
        const { app, nows, asked: all, send } = yield* inspect(true);
        yield* send('Canvas', { _tag: 'Zoomed', id: 'Counter/page#1' });
        expect(find(app, 'Inspector').model).toMatchObject({
          trail: 'Counter/page#1',
        });
        expect(find(app, 'Trail').props).toEqual({
          revision: 1,
          at: null,
          branch: null,
        });
        expect(asked(all, 'trail')).toEqual([{ instance: 'Counter/page#1' }]);
        expect(find(app, 'Trail').model).toMatchObject({
          instance: 'Counter/page#1',
          trail: {
            actor: 'Page',
            moments: [{ kind: 'started' }, { kind: 'changed' }],
          },
        });
        // The Timeline stays; the Trail is read again as the app changes.
        expect(find(app, 'Timeline')).toBeDefined();
        yield* Queue.offer(nows, nowOf(2));
        yield* settle;
        expect(asked(all, 'trail')).toHaveLength(2);
        yield* send('Trail', { _tag: 'Closed' });
        expect(
          walk(app.snapshot.root).some((one) => one.actor === 'Trail'),
        ).toBe(false);
        expect(find(app, 'Inspector').model).toMatchObject({ trail: null });
        expect(asked(all, 'seek')).toEqual([]);
      }),
    ));

  it('Seeks a moment picked in the app, zoomed back out, its card open', () =>
    run(
      Effect.gen(function* () {
        const { app, nows, asked: all, send } = yield* inspect(true);
        yield* send('Canvas', { _tag: 'Zoomed', id: 'Counter/page#1' });
        yield* send('Trail', { _tag: 'Picked', step: 2, open: true });
        expect(asked(all, 'seek')).toEqual([{ step: 2 }]);
        expect(
          walk(app.snapshot.root).some((one) => one.actor === 'Trail'),
        ).toBe(false);
        yield* Queue.offer(nows, nowOf(2, 2));
        yield* settle;
        expect(asked(all, 'graph').at(-1)).toEqual({ at: 2 });
        expect(find(app, 'Canvas').props).toMatchObject({
          at: 2,
          opened: expect.arrayContaining(['Counter/page#1']),
        });
        // A moment at init travels there too.
        yield* send('Canvas', { _tag: 'Zoomed', id: 'Counter/page#1' });
        yield* send('Trail', { _tag: 'Picked', step: 'init', open: true });
        expect(asked(all, 'seek').at(-1)).toEqual({ step: 'init' });
      }),
    ));

  it('looks at a moment on its own with Travel the app off, and opens no card for one that stopped it', () =>
    run(
      Effect.gen(function* () {
        const { app, asked: all, send } = yield* inspect(false);
        yield* send('Canvas', { _tag: 'Zoomed', id: 'Counter/page#1' });
        yield* send('Trail', { _tag: 'Picked', step: 2, open: false });
        expect(asked(all, 'seek')).toEqual([]);
        expect(asked(all, 'graph').at(-1)).toEqual({ at: 2 });
        expect(find(app, 'Timeline').props).toMatchObject({ at: 1 });
        expect(find(app, 'Inspector').model).toMatchObject({
          trail: null,
          opened: [],
        });
      }),
    ));

  it('plays each Step in turn, from the first, and shows the Head at the last', () =>
    run(
      Effect.gen(function* () {
        const { nows, asked: all, send } = yield* inspect(true);
        yield* send('Timeline', { _tag: 'Played', playing: true });
        expect(asked(all, 'seek')).toEqual([{ step: 1 }]);
        yield* Queue.offer(nows, nowOf(2, 1));
        yield* settle;
        yield* TestClock.adjust('1400 millis');
        yield* settle;
        expect(asked(all, 'seek').at(-1)).toEqual({ step: 2 });
        yield* Queue.offer(nows, nowOf(3, 2));
        yield* settle;
        yield* TestClock.adjust('1400 millis');
        yield* settle;
        expect(asked(all, 'seek').at(-1)).toEqual({ step: null });
      }),
    ));
  it('offers each way on where the History splits, and brings a Branch picked into view', () =>
    run(
      Effect.gen(function* () {
        const { app, nows, asked: all, send } = yield* inspect(true);
        yield* send('Timeline', { _tag: 'Picked', at: 0 });
        yield* Queue.offer(nows, nowOf(2, 1));
        yield* settle;
        expect(find(app, 'Timeline').props).toMatchObject({
          at: 0,
          next: [
            { id: 2, on: true },
            { id: 4, on: false },
          ],
        });
        yield* send('Timeline', { _tag: 'Branched', id: 4 });
        expect(asked(all, 'seek').at(-1)).toEqual({ step: 4 });
        expect(find(app, 'Inspector').model).toMatchObject({ branch: 4 });
        // Watched again for that Branch.
        yield* Queue.offer(nows, nowOf(3, 4));
        yield* settle;
        expect(asked(all, 'history').at(-1)).toEqual({ branch: 4 });
        expect(find(app, 'Timeline').props).toMatchObject({
          ticks: [{ id: 1 }, { id: 4 }],
          at: 1,
        });
        // Forked there, the app's Head is: its Branch is the Head's.
        yield* send('Timeline', { _tag: 'Forked' });
        expect(asked(all, 'fork')).toEqual([{ from: 4 }]);
        expect(find(app, 'Inspector').model).toMatchObject({ branch: null });
      }),
    ));

  it('brings into view the Branch of a Step the app Seeks off the one in view', () =>
    run(
      Effect.gen(function* () {
        const { app, nows, asked: all } = yield* inspect(true);
        yield* Queue.offer(nows, nowOf(2, 4));
        yield* settle;
        expect(find(app, 'Inspector').model).toMatchObject({ branch: 4 });
        yield* Queue.offer(nows, nowOf(3, 4));
        yield* settle;
        expect(asked(all, 'history').at(-1)).toEqual({ branch: 4 });
        expect(find(app, 'Timeline').props).toMatchObject({ at: 1 });
      }),
    ));
});
