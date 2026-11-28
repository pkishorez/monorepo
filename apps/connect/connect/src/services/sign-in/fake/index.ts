import { Effect, Layer, Schema, Stream, SubscriptionRef } from 'effect';
import { Fake } from '@kestack/kabuki/fake';
import { SignIn, SignInFailed } from '../contract/index.js';

export const SignInState = Schema.Struct({
  user: Schema.NullOr(
    Schema.Struct({ id: Schema.String, email: Schema.String }),
  ),
  asking: Schema.Boolean,
  refused: Schema.Boolean,
});

const idOf = (email: string) =>
  email
    .split('@')[0]!
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') || 'user';

const asked = (state: SubscriptionRef.SubscriptionRef<SignInState>) =>
  Effect.gen(function* () {
    yield* SubscriptionRef.update(state, (now) => ({
      ...now,
      asking: true,
      refused: false,
    }));
    const answered = yield* SubscriptionRef.changes(state).pipe(
      Stream.filter((now) => !now.asking),
      Stream.runHead,
    );
    const now = answered._tag === 'Some' ? answered.value : null;
    if (now === null || now.refused || now.user === null)
      return yield* new SignInFailed({
        message: 'The device code was refused',
      });
    return now.user;
  }).pipe(
    Effect.onInterrupt(() =>
      SubscriptionRef.update(state, (now) => ({ ...now, asking: false })),
    ),
  );

const answering = (state: SubscriptionRef.SubscriptionRef<SignInState>) =>
  Effect.flatMap(SubscriptionRef.get(state), (now) =>
    now.asking
      ? Effect.void
      : Effect.fail('No device code is waiting: Connect is not signing in'),
  );

export const signIn = Fake.make({
  name: 'signIn',
  state: SignInState,
  initial: { user: null, asking: false, refused: false },
  controls: {
    Approve: Fake.control(
      SignInState,
      Schema.Struct({ email: Schema.String }),
      ({ email }, state) =>
        Effect.andThen(
          answering(state),
          SubscriptionRef.update(state, () => {
            const given = email.trim() || 'ada@kestack.test';
            return {
              user: { id: idOf(given), email: given },
              asking: false,
              refused: false,
            };
          }),
        ),
    ),
    Refuse: Fake.control(SignInState, Schema.Struct({}), (_, state) =>
      Effect.andThen(
        answering(state),
        SubscriptionRef.update(state, (now) => ({
          ...now,
          asking: false,
          refused: true,
        })),
      ),
    ),
  },
  layer: (state) =>
    Layer.succeed(
      SignIn,
      SignIn.of({
        saved: Effect.map(SubscriptionRef.get(state), ({ user }) => user),
        signIn: asked(state),
        signInAgain: asked(state),
        signOut: SubscriptionRef.update(state, (now) => ({
          ...now,
          user: null,
        })),
        signing: Layer.empty as Layer.Layer<unknown>,
      }),
    ),
});

export type SignInState = typeof SignInState.Type;
