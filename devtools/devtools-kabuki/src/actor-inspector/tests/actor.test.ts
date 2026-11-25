import { Effect, Layer, Queue, Stream } from 'effect';
import type { Scope } from 'effect';
import { TestClock } from 'effect/testing';
import { describe, expect, it } from 'vitest';
import { Runtime } from '@kestack/kabuki';
import type { Instance as Live } from '@kestack/kabuki/types';
import { KabukiSession } from '../../services/kabuki-session/contract/index.ts';
import type {
  BlueprintNode,
  Entry,
  FakeNow,
  Level,
  Look,
  LookAsked,
  Looked,
  Now,
  Step,
} from '../../services/kabuki-session/contract/index.ts';
import { Inspector } from '../index.ts';

const nothing = { kind: 'struct', fields: [] } as const;

const level = (...tags: ReadonlyArray<string>): Level => ({
  messages: tags.map((tag) => ({ tag, payload: nothing })),
  workers: [],
  children: [],
  queries: [],
  provides: [],
});

const page: BlueprintNode = {
  place: 'Counter/page',
  slot: 'page',
  actor: 'Page',
  condition: 'always',
  keyed: false,
  within: null,
  single: true,
  requires: [],
  model: nothing,
  top: level(),
  states: { Single: { ...level('Turned'), data: nothing } },
  children: [],
};

const root: BlueprintNode = {
  ...page,
  place: 'Counter',
  slot: null,
  actor: 'Counter',
  condition: null,
  top: {
    ...level('Bumped'),
    children: [
      { name: 'page', actor: 'Page', condition: 'always', keyed: false },
    ],
  },
  children: [page],
};

const lights: FakeNow = {
  name: 'lights',
  state: nothing,
  value: {},
  controls: [{ name: 'Broke', payload: nothing }],
};

const looked = (address: string, actor: string, place: string): Looked => ({
  address,
  place,
  actor,
  slot: address === 'Counter' ? null : 'page',
  state: 'Single',
  change: null,
  children: [],
});

const tree: Looked = {
  ...looked('Counter', 'Counter', 'Counter'),
  children: [looked('Counter/page#1', 'Page', 'Counter/page')],
};

const entry = (id: number, parent: number | null, to = 'Counter'): Entry => ({
  id,
  parent,
  to,
  tag: 'Bumped',
  from: { kind: 'view', instance: to },
  at: id,
  outcome: 'handled',
});

const entries = [
  entry(1, null),
  entry(2, 1),
  entry(3, 2, 'Counter/page#1'),
  entry(4, 1),
];

const nowOf = (revision: number, seeking: Step | null = null): Now => ({
  head: 3,
  seeking,
  running: true,
  failure: null,
  url: '',
  revision,
});

const session = Effect.gen(function* () {
  const watched = yield* Queue.unbounded<Now>();
  const listed = yield* Queue.unbounded<ReadonlyArray<FakeNow>>();
  const asked: Array<readonly [string, unknown]> = [];
  const ask = <A>(name: string, payload: unknown, answer: A) =>
    Effect.sync(() => {
      asked.push([name, payload]);
      return answer;
    });
  const layer = Layer.succeed(KabukiSession)({
    blueprint: () => ask('blueprint', undefined, { root }),
    watch: () =>
      Stream.fromQueue(watched).pipe(Stream.map((now) => ({ now, entries }))),
    look: (payload: LookAsked) =>
      ask('look', payload, {
        at: payload.at ?? 3,
        root: tree,
        opened: Object.fromEntries(
          payload.open.map((address) => [
            address,
            {
              state: { _tag: 'Single' },
              model: {},
              folded: false,
              workers: [],
            },
          ]),
        ),
      } satisfies Look),
    travel: (payload) => ask('travel', payload, undefined),
    fork: (payload) => ask('fork', payload, undefined),
    send: (payload) => ask('send', payload, 'handled' as const),
    fakes: () => Stream.fromQueue(listed),
    control: () => Effect.succeed('done' as const),
  });
  return { layer, watched, listed, asked };
});

const walk = (at: Live): ReadonlyArray<Live> => [
  at,
  ...Object.values(at.children).flatMap((child) =>
    ((Array.isArray(child) ? child : [child]) as Array<Live>).flatMap(walk),
  ),
];

type App = Runtime<typeof Inspector>;

const all = (app: App, actor: string) =>
  walk(app.snapshot.root).filter((one) => one.actor === actor);

const find = (app: App, actor: string) => all(app, actor)[0]!;

const settle = Effect.gen(function* () {
  for (let at = 0; at < 30; at++) yield* Effect.yieldNow;
});

const run = <A>(effect: Effect.Effect<A, never, Scope.Scope>) =>
  Effect.runPromise(
    Effect.scoped(effect).pipe(Effect.provide(TestClock.layer())),
  );

const inspect = (presenting = false) =>
  Effect.gen(function* () {
    const { layer, watched, listed, asked } = yield* session;
    const app: App = yield* Runtime.scoped(Inspector, {
      input: { presenting, place: 'bottom' },
      layer,
    });
    yield* Queue.offer(watched, nowOf(1));
    yield* settle;
    const send = (actor: string, message: unknown, at = 0) =>
      Effect.andThen(
        Effect.sync(() =>
          app.at(all(app, actor)[at]!.address)?.send(message as never),
        ),
        settle,
      );
    const tell = (now: Now) =>
      Effect.andThen(Queue.offer(watched, now), settle);
    const list = (fakes: ReadonlyArray<FakeNow>) =>
      Effect.andThen(Queue.offer(listed, fakes), settle);
    return { app, asked, send, tell, list };
  });

const asked = (
  every: ReadonlyArray<readonly [string, unknown]>,
  name: string,
) => every.filter(([one]) => one === name).map(([, payload]) => payload);

const running = (app: App) =>
  find(app, 'Running').model as {
    readonly branch: number | null;
    readonly opened: ReadonlyArray<string>;
    readonly playing: boolean;
  };

describe('the Inspector', () => {
  it('shows the app at its Head, read through the Kabuki Session', () =>
    run(
      Effect.gen(function* () {
        const { app, asked: every } = yield* inspect();
        expect(app.snapshot.root.state).toEqual({ _tag: 'Running' });
        expect(asked(every, 'blueprint')).toHaveLength(1);
        expect(asked(every, 'look')).toEqual([{ open: [] }]);
        expect(find(app, 'Running').model).toMatchObject({
          now: { revision: 1 },
          look: { root: { address: 'Counter' } },
        });
      }),
    ));

  it('Time Travels the app to a Step picked, opens the card its Message was for, and goes back to now', () =>
    run(
      Effect.gen(function* () {
        const { app, asked: every, send, tell } = yield* inspect();
        yield* send('Running', { _tag: 'Picked', step: 3 });
        expect(asked(every, 'travel')).toEqual([{ to: 3 }]);
        yield* tell(nowOf(2, 3));
        expect(asked(every, 'look')).toContainEqual({ at: 3, open: [] });
        expect(find(app, 'Instance').model).toMatchObject({
          address: 'Counter/page#1',
          opened: { state: { _tag: 'Single' } },
        });
        expect(asked(every, 'look')).toContainEqual({
          at: 3,
          open: ['Counter/page#1'],
        });
        yield* send('Running', { _tag: 'Picked', step: null });
        expect(asked(every, 'travel').at(-1)).toEqual({ to: null });
      }),
    ));

  it('goes back to now from an open card, which Sends nothing while the app shows a past Step', () =>
    run(
      Effect.gen(function* () {
        const { app, asked: every, send, tell } = yield* inspect();
        yield* tell(nowOf(2, 3));
        expect(find(app, 'Instance').props).toMatchObject({ at: 3 });
        yield* send('Instance', { _tag: 'NowAsked' });
        expect(asked(every, 'travel')).toEqual([{ to: null }]);
        expect(asked(every, 'send')).toEqual([]);
      }),
    ));

  it('forks the app from the Step shown, its Branch the Head’s again', () =>
    run(
      Effect.gen(function* () {
        const { app, asked: every, send, tell } = yield* inspect();
        yield* tell(nowOf(2, 'start'));
        yield* send('Running', { _tag: 'Forked' });
        expect(asked(every, 'fork')).toEqual([{ from: 'start' }]);
        yield* tell(nowOf(3, 2));
        yield* send('Running', { _tag: 'Forked' });
        expect(asked(every, 'fork').at(-1)).toEqual({ from: 2 });
        expect(running(app).branch).toBeNull();
      }),
    ));

  it('opens and closes a card: one Instance read while it is open', () =>
    run(
      Effect.gen(function* () {
        const { app, asked: every, send, tell } = yield* inspect();
        yield* send('Running', { _tag: 'Opened', id: 'Counter', open: true });
        expect(running(app).opened).toEqual(['Counter']);
        expect(find(app, 'Instance').model).toMatchObject({
          address: 'Counter',
        });
        expect(asked(every, 'look').at(-1)).toEqual({ open: ['Counter'] });
        yield* tell(nowOf(2));
        expect(
          asked(every, 'look').filter(
            (one) => (one as LookAsked).open.length > 0,
          ),
        ).toHaveLength(2);
        yield* send('Running', { _tag: 'Opened', id: 'Counter', open: false });
        expect(running(app).opened).toEqual([]);
        expect(all(app, 'Instance')).toHaveLength(0);
      }),
    ));

  it('Sends a Message from an open card, and says what came of it', () =>
    run(
      Effect.gen(function* () {
        const { app, asked: every, send } = yield* inspect();
        yield* send('Running', { _tag: 'Opened', id: 'Counter', open: true });
        yield* send('Instance', {
          _tag: 'Submitted',
          tag: 'Bumped',
          message: { _tag: 'Bumped' },
        });
        expect(asked(every, 'send')).toEqual([
          { to: 'Counter', message: { _tag: 'Bumped' } },
        ]);
        expect(find(app, 'Instance').model).toMatchObject({
          sending: null,
          outcome: { tag: 'Bumped', said: 'handled' },
        });
      }),
    ));

  it('offers each way on where the History splits, and brings a Branch picked into view', () =>
    run(
      Effect.gen(function* () {
        const { app, asked: every, send, tell } = yield* inspect();
        yield* tell(nowOf(2, 1));
        yield* send('Running', { _tag: 'Branched', id: 4 });
        expect(asked(every, 'travel')).toEqual([{ to: 4 }]);
        expect(running(app).branch).toBe(4);
        yield* tell(nowOf(3, 4));
        expect(running(app).branch).toBe(4);
        yield* send('Running', { _tag: 'Picked', step: null });
        expect(running(app).branch).toBeNull();
      }),
    ));

  it('brings into view the Branch of a Step the app Seeks off the one in view', () =>
    run(
      Effect.gen(function* () {
        const { app, tell } = yield* inspect();
        yield* tell(nowOf(2, 4));
        expect(running(app).branch).toBe(4);
      }),
    ));

  it('plays each Step in turn, from the first, and goes back to now at the last', () =>
    run(
      Effect.gen(function* () {
        const { app, asked: every, send, tell } = yield* inspect();
        yield* send('Running', { _tag: 'Played', playing: true });
        expect(asked(every, 'travel')).toEqual([{ to: 1 }]);
        yield* tell(nowOf(2, 1));
        yield* TestClock.adjust('1400 millis');
        yield* settle;
        expect(asked(every, 'travel').at(-1)).toEqual({ to: 2 });
        yield* tell(nowOf(3, 2));
        yield* TestClock.adjust('1400 millis');
        yield* settle;
        expect(asked(every, 'travel').at(-1)).toEqual({ to: null });
        expect(running(app).playing).toBe(false);
      }),
    ));

  it('switches to the Blueprint, every Actor the root can grow, and back', () =>
    run(
      Effect.gen(function* () {
        const { app, send } = yield* inspect();
        yield* send('Inspector', { _tag: 'Viewed', tab: 'Blueprint' });
        expect(app.snapshot.root.state).toEqual({ _tag: 'Blueprint' });
        expect(all(app, 'Running')).toHaveLength(0);
        expect(find(app, 'Blueprint').model).toMatchObject({
          root: { place: 'Counter' },
        });
        yield* send('Blueprint', {
          _tag: 'Opened',
          id: 'Counter/page',
          open: true,
        });
        expect(find(app, 'Blueprint').model).toMatchObject({
          opened: ['Counter/page'],
        });
        yield* send('Inspector', { _tag: 'Viewed', tab: 'Running' });
        expect(all(app, 'Blueprint')).toHaveLength(0);
        expect(find(app, 'Running')).toBeDefined();
      }),
    ));

  it('presenting, opens no card and stays on the app Running', () =>
    run(
      Effect.gen(function* () {
        const { app, send, tell } = yield* inspect(true);
        yield* tell(nowOf(2, 3));
        expect(all(app, 'Instance')).toHaveLength(0);
        yield* send('Inspector', { _tag: 'Viewed', tab: 'Blueprint' });
        expect(app.snapshot.root.state).toEqual({ _tag: 'Running' });
      }),
    ));
  it('has a World tab only while the app has a Fake, and leaves it once the last one goes', () =>
    run(
      Effect.gen(function* () {
        const { app, send, list } = yield* inspect();
        yield* send('Inspector', { _tag: 'Viewed', tab: 'World' });
        expect(app.snapshot.root.state).toEqual({ _tag: 'Running' });

        yield* list([lights]);
        yield* send('Inspector', { _tag: 'Viewed', tab: 'World' });
        expect(app.snapshot.root.state).toEqual({ _tag: 'World' });
        expect(find(app, 'World').props).toEqual({ fakes: [lights] });

        yield* list([]);
        expect(app.snapshot.root.state).toEqual({ _tag: 'Running' });
        expect(all(app, 'World')).toHaveLength(0);
      }),
    ));
});
