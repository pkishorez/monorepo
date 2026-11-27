import { Context, Effect, Exit, Layer, Option, Schema, Stream } from 'effect';
import { SubscriptionRef } from 'effect';
import type { Scope } from 'effect';
import { describe, expect, it } from 'vitest';
import { Fake, FakeWorld } from '@kestack/kabuki/fake';
import { KabukiSession } from '../contract/index.ts';
import type { FakeNow } from '../contract/index.ts';
import { inPage } from '../real/index.ts';
import { started } from './diary.ts';

const run = <A, E>(effect: Effect.Effect<A, E, Scope.Scope>) =>
  Effect.runPromise(Effect.scoped(effect));

const failure = <A, E>(exit: Exit.Exit<A, E>) =>
  Exit.isFailure(exit) ? exit.cause.reasons[0] : undefined;

class Computers extends Context.Service<
  Computers,
  { readonly names: Effect.Effect<ReadonlyArray<string>> }
>()('Test/service/Computers') {}

const Owned = Schema.Struct({
  names: Schema.Array(Schema.String),
  since: Schema.DateFromString,
});

const computers = Fake.make({
  name: 'computers',
  state: Owned,
  initial: { names: ['mac'], since: new Date(5) },
  controls: {
    Bought: Fake.control(
      Owned,
      Schema.Struct({ name: Schema.String }),
      ({ name }, state) =>
        SubscriptionRef.update(state, (owned) => ({
          ...owned,
          names: [...owned.names, name],
        })),
    ),
    Sold: Fake.control(
      Owned,
      Schema.Struct({ name: Schema.String }),
      ({ name }, state) =>
        Effect.flatMap(SubscriptionRef.get(state), (owned) =>
          owned.names.includes(name)
            ? SubscriptionRef.set(state, {
                ...owned,
                names: owned.names.filter((one) => one !== name),
              })
            : Effect.fail(`no computer named ${name}`),
        ),
    ),
  },
  layer: (state) =>
    Layer.succeed(Computers)({
      names: Effect.map(SubscriptionRef.get(state), ({ names }) => names),
    }),
});

const world = FakeWorld.make([computers]);

const opened = Effect.gen(function* () {
  const services = yield* Layer.build(world.layer);
  const { app } = yield* started;
  const session = yield* Effect.provide(
    Effect.service(KabukiSession),
    inPage(app, world),
  );
  return { session, services };
});

const worldNow = (session: KabukiSession['Service']) =>
  session
    .world()
    .pipe(
      Stream.runHead,
      Effect.map(Option.getOrThrow<ReadonlyArray<FakeNow>>),
    );

describe('world', () => {
  it('shows each Fake: its name, a Shape of its state, its state encoded, and its controls', () =>
    run(
      Effect.gen(function* () {
        const { session } = yield* opened;
        expect(yield* worldNow(session)).toEqual([
          {
            name: 'computers',
            state: {
              kind: 'struct',
              fields: [
                {
                  name: 'names',
                  optional: false,
                  nullable: false,
                  shape: { kind: 'array', of: { kind: 'text' } },
                },
                {
                  name: 'since',
                  optional: false,
                  nullable: false,
                  shape: { kind: 'text' },
                },
              ],
            },
            value: { names: ['mac'], since: new Date(5).toISOString() },
            controls: [
              {
                name: 'Bought',
                payload: {
                  kind: 'struct',
                  fields: [
                    {
                      name: 'name',
                      optional: false,
                      nullable: false,
                      shape: { kind: 'text' },
                    },
                  ],
                },
              },
              expect.objectContaining({ name: 'Sold' }),
            ],
          },
        ]);
      }),
    ));

  it('is empty when the app runs no FakeWorld', () =>
    run(
      Effect.gen(function* () {
        const { app } = yield* started;
        const session = yield* Effect.provide(
          Effect.service(KabukiSession),
          inPage(app),
        );
        expect(yield* worldNow(session)).toEqual([]);
        expect(
          failure(
            yield* Effect.exit(
              session.control({
                fake: 'computers',
                control: 'Bought',
                payload: {},
              }),
            ),
          ),
        ).toMatchObject({
          error: {
            _tag: 'ControlRefused',
            reason: 'This app runs no FakeWorld',
          },
        });
      }),
    ));
});

describe('control', () => {
  it('runs a control on the state the app reads, its payload as plain JSON', () =>
    run(
      Effect.gen(function* () {
        const { session, services } = yield* opened;
        expect(
          yield* session.control({
            fake: 'computers',
            control: 'Bought',
            payload: { name: 'pc' },
          }),
        ).toBe('done');
        expect(yield* Context.get(services, Computers).names).toEqual([
          'mac',
          'pc',
        ]);
        expect((yield* worldNow(session))[0]!.value).toMatchObject({
          names: ['mac', 'pc'],
        });
      }),
    ));

  it('says why it could not: no such Fake or control, a payload refused, or the control’s own reason', () =>
    run(
      Effect.gen(function* () {
        const { session } = yield* opened;
        const refused = (fake: string, control: string, payload: unknown) =>
          Effect.map(
            Effect.exit(session.control({ fake, control, payload })),
            failure,
          );
        expect(yield* refused('printers', 'Bought', {})).toMatchObject({
          error: {
            _tag: 'ControlRefused',
            fake: 'printers',
            reason: 'No Fake is named printers',
          },
        });
        expect(yield* refused('computers', 'Stolen', {})).toMatchObject({
          error: { reason: 'computers has no control Stolen' },
        });
        const bad = yield* refused('computers', 'Bought', { name: 5 });
        expect(
          (bad as { readonly error: { readonly reason: string } }).error.reason,
        ).toMatch(/^computers Bought refuses its payload/);
        expect(
          yield* refused('computers', 'Sold', { name: 'pc' }),
        ).toMatchObject({ error: { reason: 'no computer named pc' } });
      }),
    ));
});
