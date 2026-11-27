import { Effect, Layer, Queue, Stream } from 'effect';
import type { Scope } from 'effect';
import { TestClock } from 'effect/testing';
import { describe, expect, it } from 'vitest';
import { Runtime } from '@kestack/kabuki';
import type { Instance as Live } from '@kestack/kabuki/types';
import { KabukiSession } from '../../services/kabuki-session/contract/index.ts';
import type {
  Entry,
  LookAsked,
  Looked,
  Node,
  Now,
  StepAsked,
  Stepped,
} from '../../services/kabuki-session/contract/index.ts';
import { Inspector } from '../index.ts';

const node = (
  address: string,
  actor: string,
  children: Array<Node> = [],
): Node => ({
  address,
  actor,
  slot: address === 'Counter' ? null : 'page',
  state: 'Single',
  data: {},
  model: {},
  workers: [],
  provides: [],
  children,
});

const tree = node('Counter', 'Counter', [node('Counter/page#1', 'Page')]);

const entry = (id: number, parent: number | null, to = 'Counter'): Entry => ({
  id,
  parent,
  to,
  tag: 'Bumped',
  from: { kind: 'view', instance: to },
  at: id,
  outcome: 'handled',
  changed: true,
});

const entries = [entry(1, null), entry(2, 1), entry(3, 2, 'Counter/page#1')];

const nowOf = (revision: number): Now => ({
  head: 3,
  previewing: null,
  running: true,
  failure: null,
  url: '',
  revision,
});

const looked = (address: string): Looked => ({
  at: 3,
  address,
  actor: 'Page',
  slot: 'page',
  state: 'Single',
  states: ['Single'],
  data: { _tag: 'Single' },
  model: {},
  workers: [],
  provides: [],
  takes: [
    {
      tag: 'Turned',
      payload: { kind: 'struct', fields: [] },
      within: 'always',
    },
  ],
});

const session = Effect.gen(function* () {
  const told = yield* Queue.unbounded<Now & { readonly epoch?: string }>();
  const asked: Array<readonly [string, unknown]> = [];
  const ask = <A>(name: string, payload: unknown, answer: A) =>
    Effect.sync(() => {
      asked.push([name, payload]);
      return answer;
    });
  const layer = Layer.succeed(KabukiSession)({
    history: () =>
      Stream.fromQueue(told).pipe(
        Stream.map(({ epoch = 'one', ...now }) => ({
          now,
          epoch,
          entries,
          roots: [1],
        })),
      ),
    step: (payload: StepAsked) =>
      ask('step', payload, {
        at: payload.at ?? 3,
        tree,
        message: null,
        changes: [],
      } satisfies Stepped),
    look: (payload: LookAsked) => ask('look', payload, looked(payload.address)),
    preview: (payload) => ask('preview', payload, undefined),
    fork: (payload) => ask('fork', payload, undefined),
    send: (payload) => ask('send', payload, 'handled' as const),
    world: () => Stream.empty,
    control: () => Effect.succeed('done' as const),
  });
  return { layer, told, asked };
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

const settle = Effect.gen(function* () {
  for (let at = 0; at < 30; at++) yield* Effect.yieldNow;
});

const run = <A>(effect: Effect.Effect<A, never, Scope.Scope>) =>
  Effect.runPromise(
    Effect.scoped(effect).pipe(Effect.provide(TestClock.layer())),
  );

const inspect = Effect.gen(function* () {
  const { layer, told, asked } = yield* session;
  const app: App = yield* Runtime.scoped(Inspector, {
    input: { presenting: false, place: 'bottom' },
    layer,
  });
  yield* Queue.offer(told, nowOf(1));
  yield* settle;
  const send = (actor: string, message: unknown) =>
    Effect.andThen(
      Effect.sync(() =>
        app.at(all(app, actor)[0]!.address)?.send(message as never),
      ),
      settle,
    );
  const calls = (name: string) =>
    asked.filter(([one]) => one === name).map(([, payload]) => payload);
  const tell = (now: Now & { readonly epoch?: string }) =>
    Effect.andThen(Queue.offer(told, now), settle);
  const model = () =>
    all(app, 'Inspector')[0]!.model as Record<string, unknown>;
  return { app, send, calls, model, tell };
});

describe('Inspector', () => {
  it('reads the Head, then the Step picked, without moving the app', () =>
    run(
      Effect.gen(function* () {
        const { send, calls, model } = yield* inspect;
        expect(calls('step')).toEqual([{}]);
        expect(model()['stepped']).not.toBeNull();
        yield* send('Inspector', { _tag: 'Picked', step: 2 });
        expect(calls('step')).toEqual([{}, { at: 2 }]);
        expect(calls('preview')).toEqual([]);
      }),
    ));

  it('moves the app to each Step picked while it previews, and back when off', () =>
    run(
      Effect.gen(function* () {
        const { send, calls } = yield* inspect;
        yield* send('Inspector', { _tag: 'Picked', step: 2 });
        yield* send('Inspector', { _tag: 'Previewed', on: true });
        yield* send('Inspector', { _tag: 'Picked', step: 'start' });
        yield* send('Inspector', { _tag: 'Previewed', on: false });
        expect(calls('preview')).toEqual([
          { at: 2 },
          { at: 'start' },
          { at: null },
        ]);
      }),
    ));

  it('forks at the Step shown, then follows the Head', () =>
    run(
      Effect.gen(function* () {
        const { send, calls, model } = yield* inspect;
        yield* send('Inspector', { _tag: 'Picked', step: 1 });
        yield* send('Inspector', { _tag: 'Forked' });
        expect(calls('fork')).toEqual([{ from: 1 }]);
        expect(model()['shown']).toBeNull();
      }),
    ));

  it('opens an Instance whole, Sends it a Message, and closes', () =>
    run(
      Effect.gen(function* () {
        const { app, send, calls } = yield* inspect;
        yield* send('Inspector', { _tag: 'Opened', address: 'Counter/page#1' });
        expect(calls('look')).toEqual([{ address: 'Counter/page#1' }]);
        const [instance] = all(app, 'Instance');
        expect(
          (instance!.model as { looked: Looked | null }).looked?.takes,
        ).toHaveLength(1);
        yield* send('Instance', {
          _tag: 'Submitted',
          tag: 'Turned',
          message: { _tag: 'Turned' },
        });
        expect(calls('send')).toEqual([
          { to: 'Counter/page#1', message: { _tag: 'Turned' } },
        ]);
        yield* send('Instance', { _tag: 'Closed' });
        expect(all(app, 'Instance')).toHaveLength(0);
      }),
    ));

  it('reads an open Instance again at the Step picked', () =>
    run(
      Effect.gen(function* () {
        const { send, calls } = yield* inspect;
        yield* send('Inspector', { _tag: 'Opened', address: 'Counter/page#1' });
        yield* send('Inspector', { _tag: 'Picked', step: 2 });
        expect(calls('look')).toEqual([
          { address: 'Counter/page#1' },
          { address: 'Counter/page#1', at: 2 },
        ]);
      }),
    ));

  it('goes back to the Head when the History starts again', () =>
    run(
      Effect.gen(function* () {
        const { send, calls, model, tell } = yield* inspect;
        yield* send('Inspector', { _tag: 'Picked', step: 2 });
        yield* tell({ ...nowOf(2), epoch: 'two' });
        expect(model()['shown']).toBeNull();
        expect(calls('step').at(-1)).toEqual({});
      }),
    ));
});
