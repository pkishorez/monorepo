import { Effect, Layer, Queue, Stream } from 'effect';
import type { Scope } from 'effect';
import { describe, expect, it } from 'vitest';
import { Runtime } from '@kestack/kabuki';
import type { Instance as Live } from '@kestack/kabuki/types';
import { ControlRefused } from '../../../../server/rpc/session/contract/index.ts';
import { KabukiSession } from '../../../../services/kabuki-session/contract/index.ts';
import type {
  BlueprintNode,
  ControlAsked,
  FakeNow,
} from '../../../../services/kabuki-session/contract/index.ts';
import { Inspector } from '../../../index.ts';
import { fakesOf } from '../logic/shared/index.ts';

const nothing = { kind: 'struct', fields: [] } as const;

const root: BlueprintNode = {
  place: 'Shop',
  slot: null,
  actor: 'Shop',
  condition: null,
  keyed: false,
  within: null,
  single: true,
  requires: [],
  model: nothing,
  top: { messages: [], workers: [], children: [], queries: [], provides: [] },
  states: {},
  children: [],
};

const lights = (on: boolean): FakeNow => ({
  name: 'lights',
  state: {
    kind: 'struct',
    fields: [
      {
        name: 'on',
        optional: false,
        nullable: false,
        shape: { kind: 'boolean' },
      },
    ],
  },
  value: { on },
  controls: [
    {
      name: 'Switched',
      payload: {
        kind: 'struct',
        fields: [
          {
            name: 'on',
            optional: false,
            nullable: false,
            shape: { kind: 'boolean' },
          },
        ],
      },
    },
    { name: 'Broke', payload: nothing },
  ],
});

const session = Effect.gen(function* () {
  const told = yield* Queue.unbounded<ReadonlyArray<FakeNow>>();
  const asked: Array<ControlAsked> = [];
  const layer = Layer.succeed(KabukiSession)({
    blueprint: () => Effect.succeed({ root }),
    watch: () => Stream.never,
    look: () => Effect.never,
    travel: () => Effect.void,
    fork: () => Effect.void,
    send: () => Effect.succeed('handled' as const),
    fakes: () => Stream.fromQueue(told),
    control: (one) =>
      Effect.suspend(() => {
        asked.push(one);
        return one.control === 'Broke'
          ? Effect.fail(
              new ControlRefused({
                fake: one.fake,
                control: one.control,
                reason: 'The lights are already broken.',
              }),
            )
          : Effect.succeed('done' as const);
      }),
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

const find = (app: App, actor: string) =>
  walk(app.snapshot.root).find((one) => one.actor === actor);

const settle = Effect.gen(function* () {
  for (let at = 0; at < 30; at++) yield* Effect.yieldNow;
});

const run = <A>(effect: Effect.Effect<A, never, Scope.Scope>) =>
  Effect.runPromise(Effect.scoped(effect));

const inspect = Effect.gen(function* () {
  const { layer, told, asked } = yield* session;
  const app: App = yield* Runtime.scoped(Inspector, {
    input: { presenting: false, place: 'bottom' },
    layer,
  });
  const tell = (fakes: ReadonlyArray<FakeNow>) =>
    Effect.andThen(Queue.offer(told, fakes), settle);
  const send = (actor: string, message: unknown) =>
    Effect.andThen(
      Effect.sync(() =>
        app.at(find(app, actor)!.address)?.send(message as never),
      ),
      settle,
    );
  const shown = () => {
    const world = find(app, 'World')!;
    return fakesOf({
      model: world.model,
      props: (world as Live & { readonly props: unknown }).props,
    } as never);
  };
  return { app, asked, tell, send, shown };
});

describe('the World tab', () => {
  it('lists each Fake with its state now, and a form per control', () =>
    run(
      Effect.gen(function* () {
        const { tell, send, shown } = yield* inspect;
        yield* tell([lights(false)]);
        yield* send('Inspector', { _tag: 'Viewed', tab: 'World' });
        expect(shown()).toEqual([
          {
            name: 'lights',
            value: { on: false },
            controls: [
              expect.objectContaining({
                name: 'Switched',
                bare: false,
                input: {
                  kind: 'group',
                  fields: [expect.objectContaining({ name: 'on' })],
                },
                outcome: undefined,
              }),
              expect.objectContaining({ name: 'Broke', bare: true }),
            ],
          },
        ]);
        yield* tell([lights(true)]);
        expect(shown()[0]!.value).toEqual({ on: true });
      }),
    ));

  it('runs a control and says it is done', () =>
    run(
      Effect.gen(function* () {
        const { asked, tell, send, shown } = yield* inspect;
        yield* tell([lights(false)]);
        yield* send('Inspector', { _tag: 'Viewed', tab: 'World' });
        yield* send('World', {
          _tag: 'Submitted',
          fake: 'lights',
          control: 'Switched',
          payload: { on: true },
        });
        expect(asked).toEqual([
          { fake: 'lights', control: 'Switched', payload: { on: true } },
        ]);
        expect(shown()[0]!.controls[0]!.outcome).toEqual({
          fake: 'lights',
          control: 'Switched',
          said: 'done',
        });
      }),
    ));

  it('says what came of a control only until its form changes', () =>
    run(
      Effect.gen(function* () {
        const { tell, send, shown } = yield* inspect;
        yield* tell([lights(false)]);
        yield* send('Inspector', { _tag: 'Viewed', tab: 'World' });
        yield* send('World', {
          _tag: 'Submitted',
          fake: 'lights',
          control: 'Switched',
          payload: { on: true },
        });
        yield* send('World', {
          _tag: 'Submitted',
          fake: 'lights',
          control: 'Broke',
          payload: {},
        });
        yield* send('World', {
          _tag: 'Edited',
          fake: 'lights',
          control: 'Switched',
        });
        const [switched, broke] = shown()[0]!.controls;
        expect(switched!.outcome).toBeUndefined();
        expect(broke!.outcome).toMatchObject({ said: 'refused' });
      }),
    ));

  it('says why a control was refused, beside that control only', () =>
    run(
      Effect.gen(function* () {
        const { tell, send, shown } = yield* inspect;
        yield* tell([lights(false)]);
        yield* send('Inspector', { _tag: 'Viewed', tab: 'World' });
        yield* send('World', {
          _tag: 'Submitted',
          fake: 'lights',
          control: 'Broke',
          payload: {},
        });
        const [switched, broke] = shown()[0]!.controls;
        expect(broke!.outcome).toEqual({
          fake: 'lights',
          control: 'Broke',
          said: 'refused',
          reason: 'The lights are already broken.',
        });
        expect(switched!.outcome).toBeUndefined();
      }),
    ));
});
