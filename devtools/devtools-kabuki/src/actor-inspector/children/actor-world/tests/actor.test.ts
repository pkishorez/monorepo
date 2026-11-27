import { Effect, Layer, Stream } from 'effect';
import type { Scope } from 'effect';
import { describe, expect, it } from 'vitest';
import { Runtime } from '@kestack/kabuki';
import { ControlRefused } from '../../../../server/rpc/session/contract/index.ts';
import type {
  ControlAsked,
  FakeNow,
} from '../../../../server/rpc/session/contract/index.ts';
import { KabukiSession } from '../../../../services/kabuki-session/contract/index.ts';
import { World } from '../index.ts';
import { fakesOf, hasFakes } from '../logic/shared/index.ts';

const signIn: FakeNow = {
  name: 'signIn',
  state: {
    kind: 'struct',
    fields: [],
  },
  value: { accounts: [], asking: null },
  controls: [
    {
      name: 'SignInAs',
      description: 'Answers the sign-in the app is asking',
      payload: {
        kind: 'struct',
        fields: [
          {
            name: 'email',
            optional: false,
            nullable: false,
            shape: { kind: 'text' },
          },
        ],
      },
    },
    { name: 'CancelSignIn', payload: { kind: 'struct', fields: [] } },
  ],
};

const settle = Effect.gen(function* () {
  for (let at = 0; at < 30; at++) yield* Effect.yieldNow;
});

const run = <A>(effect: Effect.Effect<A, never, Scope.Scope>) =>
  Effect.runPromise(Effect.scoped(effect));

const world = (fakes: ReadonlyArray<FakeNow>) =>
  Effect.gen(function* () {
    const asked: Array<ControlAsked> = [];
    const layer = Layer.succeed(KabukiSession)({
      history: () => Stream.never,
      step: () => Effect.die('World reads no Step'),
      look: () => Effect.die('World looks at no Instance'),
      preview: () => Effect.die('World previews nothing'),
      fork: () => Effect.die('World forks nothing'),
      send: () => Effect.die('World Sends no Message'),
      world: () => Stream.make(fakes),
      control: (one) =>
        Effect.suspend(() => {
          asked.push(one);
          return one.control === 'CancelSignIn'
            ? Effect.fail(
                new ControlRefused({
                  fake: one.fake,
                  control: one.control,
                  reason: 'No sign-in is asking who.',
                }),
              )
            : Effect.succeed('done' as const);
        }),
      blueprint: () => Effect.die('World reads no Blueprint'),
    });
    const app = yield* Runtime.scoped(World, { layer });
    yield* settle;
    const send = (message: unknown) =>
      Effect.andThen(
        Effect.sync(() => app.root.send(message as never)),
        settle,
      );
    const data = () => app.snapshot.root as never;
    return { asked, send, data };
  });

describe('World', () => {
  it('shows each Fake with its fields and its controls in plain words', () =>
    run(
      Effect.gen(function* () {
        const { data } = yield* world([signIn]);
        expect(hasFakes(data())).toBe(true);
        const [fake] = fakesOf(data());
        expect(fake?.label).toBe('Sign in');
        expect(fake?.fields).toEqual([
          ['accounts', []],
          ['asking', null],
        ]);
        expect(
          fake?.controls.map(({ label, bare }) => ({ label, bare })),
        ).toEqual([
          { label: 'Sign in as', bare: false },
          { label: 'Cancel sign in', bare: true },
        ]);
      }),
    ));

  it('has no Fakes when the app runs no FakeWorld', () =>
    run(
      Effect.gen(function* () {
        const { data } = yield* world([]);
        expect(hasFakes(data())).toBe(false);
      }),
    ));

  it('runs a control without waiting, and shows only a refusal', () =>
    run(
      Effect.gen(function* () {
        const { asked, send, data } = yield* world([signIn]);
        yield* send({
          _tag: 'Ran',
          fake: 'signIn',
          control: 'SignInAs',
          payload: { email: 'you@kestack.test' },
        });
        expect(asked).toEqual([
          {
            fake: 'signIn',
            control: 'SignInAs',
            payload: { email: 'you@kestack.test' },
          },
        ]);
        expect(fakesOf(data())[0]?.refusal).toBeNull();
        yield* send({
          _tag: 'Ran',
          fake: 'signIn',
          control: 'CancelSignIn',
          payload: {},
        });
        expect(fakesOf(data())[0]?.refusal).toEqual({
          fake: 'signIn',
          control: 'CancelSignIn',
          reason: 'No sign-in is asking who.',
          label: 'Cancel sign in',
        });
        yield* send({ _tag: 'Dismissed' });
        expect(fakesOf(data())[0]?.refusal).toBeNull();
      }),
    ));
});
