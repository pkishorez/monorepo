import { Effect, Layer, Queue, Stream } from 'effect';
import type { Scope } from 'effect';
import { TestClock } from 'effect/testing';
import { History, Runtime } from '@kestack/kabuki';
import type { Running } from '@kestack/kabuki/core/runtime';
import type { Instance } from '@kestack/kabuki/core/snapshot';
import { describe, expect, it } from 'vitest';
import type * as Api from '../../../api/index.ts';
import type { KabukiSessionClient } from '../../../api/index.ts';
import { KabukiSession } from '../../kabuki-session/index.ts';
import { InspectorLive } from '../index.ts';

/*
 * The Inspector on a Kabuki Session stood in for: it shows where the app
 * is as it is told, draws the Step shown, and moves the app only through
 * the Api. With Travel the app on, picking a Step travels the app and Fork
 * carries on from it; off, the Inspector looks back on its own. Playing
 * steps through each Step in turn and goes live at the last.
 */

type Client = KabukiSessionClient;

const entry = (id: number, destination = 'Counter'): Api.Entry => ({
  id,
  parent: id === 1 ? null : id - 1,
  destination,
  message: { _tag: 'Bumped' },
  tag: 'Bumped',
  source: { kind: 'view', instance: destination },
  at: id,
  outcome: 'handled',
});

const root: Api.GraphNode = {
  id: 'Counter',
  title: 'Counter',
  actor: 'Counter',
  blueprint: {
    name: 'Counter',
    states: ['Single'],
    single: true,
    requires: [],
    top: {
      on: ['Bumped'],
      workers: [],
      children: [],
      queries: [],
      provides: false,
    },
    state: {},
  },
  condition: null,
  keyed: false,
  within: null,
  state: 'Single',
  workers: [],
  touched: [],
  gone: [],
  children: [],
};

const nowOf = (
  revision: number,
  shown: Api.Step | null = null,
  head = 3,
): Api.Now => ({
  head,
  size: head,
  shown,
  running: true,
  failure: null,
  revision,
});

/** The stand-in Kabuki Session, and everything it was asked. */
const session = Effect.gen(function* () {
  const nows = yield* Queue.unbounded<Api.Now>();
  const asked: Array<readonly [string, unknown]> = [];
  const entries = [entry(1), entry(2), entry(3, 'Counter/page#1')];
  const ask = <A>(name: string, payload: unknown, answer: A) =>
    Effect.sync(() => {
      asked.push([name, payload]);
      return answer;
    });
  // An RPC client's procedures are generic over how they are called; a
  // stand-in answers the one way the Inspector calls them.
  const layer = Layer.mock(KabukiSession)({
    watch: (() => Stream.fromQueue(nows)) as unknown as Client['watch'],
    history: (() =>
      Effect.succeed({
        entries,
        head: 3,
        size: 3,
        shown: null,
        running: true,
        failure: null,
      })) as unknown as Client['history'],
    graph: ((payload: { readonly at?: Api.Step }) =>
      ask('graph', payload, {
        at: payload.at ?? 3,
        root,
      })) as unknown as Client['graph'],
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
    travel: ((payload: unknown) =>
      ask('travel', payload, undefined)) as unknown as Client['travel'],
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

const find = (app: Running<unknown>, actor: string) =>
  walk(app.snapshot()).find((one) => one.actor === actor)!;

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
    const app = (yield* Runtime.start(
      History.make(InspectorLive, {
        window: null,
        input: { travel, look: { presenting: false, place: 'bottom' } },
      }),
      layer,
    )) as unknown as Running<unknown>;
    yield* Queue.offer(nows, nowOf(1));
    yield* settle;
    const send = (actor: string, message: unknown) =>
      Effect.andThen(
        Effect.sync(() => app.send(find(app, actor).id, message as never)),
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

  it('travels the app to a Step picked, and draws it once the app shows it', () =>
    run(
      Effect.gen(function* () {
        const { app, nows, asked: all, send } = yield* inspect(true);
        yield* send('Timeline', { _tag: 'Picked', at: 2 });
        expect(asked(all, 'travel')).toEqual([{ step: 3 }]);
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

  it('draws init, not live, while the app shows init, and forks from it', () =>
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
        expect(asked(all, 'travel')).toEqual([]);
        expect(asked(all, 'graph').at(-1)).toEqual({ at: 1 });
        expect(find(app, 'Timeline').props).toMatchObject({ at: 0 });
        yield* send('Timeline', { _tag: 'Travelled', travel: true });
        expect(asked(all, 'travel')).toEqual([{ step: 1 }]);
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

  it('plays each Step in turn, from the first, and goes live at the last', () =>
    run(
      Effect.gen(function* () {
        const { nows, asked: all, send } = yield* inspect(true);
        yield* send('Timeline', { _tag: 'Played', playing: true });
        expect(asked(all, 'travel')).toEqual([{ step: 1 }]);
        yield* Queue.offer(nows, nowOf(2, 1));
        yield* settle;
        yield* TestClock.adjust('1400 millis');
        yield* settle;
        expect(asked(all, 'travel').at(-1)).toEqual({ step: 2 });
        yield* Queue.offer(nows, nowOf(3, 2));
        yield* settle;
        yield* TestClock.adjust('1400 millis');
        yield* settle;
        expect(asked(all, 'travel').at(-1)).toEqual({ step: null });
      }),
    ));
});
