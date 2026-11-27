import { Effect, Exit, Fiber, Layer, type Scope, Stream } from 'effect';
import { FakeWorld } from '@kestack/kabuki/fake';
import { Memory } from '@kestack/std-toolkit/db/memory';
import { describe, expect, it } from 'vitest';
import { Accounts, type AccountsState } from '../../client/accounts/index.js';
import {
  browserAccountsTable,
  type CacheStorage,
} from '../../client/browser/index.js';
import { signIn, type SignInState } from '../index.js';
import { fakeUser } from '../token.js';

/*
 * The Sign-in fake's controls, as the app sees them: each changes the
 * fake's state, and the app's Accounts, the real client over it, change
 * as they would over the real Auth Worker, on the same page.
 */

type World = ReturnType<typeof worldOf>;

const worldOf = (cache?: CacheStorage, start?: SignInState) =>
  FakeWorld.make(
    [signIn({ cache })],
    start ? { start: { signIn: start } } : {},
  );

/** The Sign-in fake's world started, and the app's Accounts over it. */
const run = <A, E>(
  body: (world: World) => Effect.Effect<A, E, Accounts | Scope.Scope>,
  { cache, start }: { cache?: CacheStorage; start?: SignInState } = {},
) =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const world = worldOf(cache, start);
        const accounts = yield* Layer.build(world.layer);
        return yield* body(world).pipe(Effect.provideContext(accounts));
      }),
    ),
  );

/** The fake's state once it passes `test`. */
const stateOf = (
  world: World,
  test: (state: SignInState) => boolean = () => true,
) =>
  world.fakes.pipe(
    Stream.map((fakes) => fakes[0]!.value as SignInState),
    Stream.filter(test),
    Stream.runHead,
    Effect.map((found) => (found._tag === 'Some' ? found.value : null)),
  );

/** Who the app sees signed in, by email, the active one marked. */
const shown = (state: AccountsState) =>
  state._tag === 'SignedIn'
    ? state.accounts.map(({ email }) =>
        email === state.active.email ? `${email} *` : email,
      )
    : state._tag;

const current = Effect.flatMap(Accounts, ({ current }) =>
  Effect.map(current, shown),
);

/** Starts a sign-in, and waits until the fake asks who. */
const asking = (world: World, options?: { readonly returnTo: string }) =>
  Effect.gen(function* () {
    const accounts = yield* Accounts;
    const fiber = yield* Effect.forkChild(
      Effect.exit(accounts.signIn(options)),
    );
    yield* stateOf(world, ({ asking }) => asking !== null);
    return fiber;
  });

const signInAs = (world: World, email: string, name = '') =>
  world.control('signIn', 'SignInAs', { email, name });

/** Signs in as each email in turn, through the SignInAs control. */
const signedInAs = (world: World, ...emails: ReadonlyArray<string>) =>
  Effect.forEach(
    emails,
    (email) =>
      Effect.gen(function* () {
        const fiber = yield* asking(world);
        yield* signInAs(world, email);
        return yield* Fiber.join(fiber);
      }),
    { discard: true },
  );

describe('the Sign-in fake', () => {
  it('starts with nobody signed in', async () => {
    expect(
      await run(() =>
        Effect.flatMap(Accounts, ({ check }) => Effect.map(check, shown)),
      ),
    ).toBe('SignedOut');
  });

  it('holds a sign-in in its state until it is told who, then the app has them, on the same page', async () => {
    const [waiting, exit, after, state] = await run((world) =>
      Effect.gen(function* () {
        const fiber = yield* asking(world, {
          returnTo: 'https://app.example.com/elsewhere',
        });
        const waiting = (yield* stateOf(world))?.asking;
        yield* signInAs(world, 'Ada@Kestack.Test', 'Ada');
        const exit = yield* Fiber.join(fiber);
        return [waiting, exit, yield* current, yield* stateOf(world)] as const;
      }),
    );
    expect(waiting).toEqual({ adding: false });
    expect(Exit.isSuccess(exit)).toBe(true);
    expect(after).toEqual(['ada@kestack.test *']);
    expect(state).toMatchObject({
      asking: null,
      accounts: [{ email: 'ada@kestack.test', name: 'Ada' }],
    });
  });

  it('signs you@kestack.test in for a blank email, and a bare name at kestack.test', async () => {
    expect(
      await run((world) =>
        Effect.andThen(signedInAs(world, '', 'grace'), current),
      ),
    ).toEqual(['you@kestack.test', 'grace@kestack.test *']);
  });

  it('adds an Account beside the others, and asks as adding', async () => {
    const [adding, after] = await run((world) =>
      Effect.gen(function* () {
        yield* signedInAs(world, 'ada');
        const fiber = yield* asking(world);
        const adding = (yield* stateOf(world))?.asking?.adding;
        yield* signInAs(world, 'bob');
        yield* Fiber.join(fiber);
        return [adding, yield* current] as const;
      }),
    );
    expect(adding).toBe(true);
    expect(after).toEqual(['ada@kestack.test', 'bob@kestack.test *']);
  });

  it('cancelled, the sign-in ends with nobody and nothing changes', async () => {
    const [exit, after] = await run((world) =>
      Effect.gen(function* () {
        yield* signedInAs(world, 'ada');
        const fiber = yield* asking(world);
        yield* world.control('signIn', 'Cancel', {});
        return [yield* Fiber.join(fiber), yield* current] as const;
      }),
    );
    expect(Exit.isSuccess(exit)).toBe(true);
    expect(after).toEqual(['ada@kestack.test *']);
  });

  it('refuses an email outside kestack.test, the sign-in still asking', async () => {
    const [reason, still, after] = await run((world) =>
      Effect.gen(function* () {
        const fiber = yield* asking(world);
        const reason = yield* Effect.flip(signInAs(world, 'ada@example.com'));
        const still = (yield* stateOf(world))?.asking;
        yield* world.control('signIn', 'Cancel', {});
        yield* Fiber.join(fiber);
        return [reason, still, yield* current] as const;
      }),
    );
    expect(reason).toBe(
      'Only an email at @kestack.test signs in here, not ada@example.com.',
    );
    expect(still).toEqual({ adding: false });
    expect(after).toBe('SignedOut');
  });

  it('answers nothing when no sign-in is asking', async () => {
    const reasons = await run((world) =>
      Effect.all([
        Effect.flip(signInAs(world, 'ada')),
        Effect.flip(world.control('signIn', 'Cancel', {})),
      ]),
    );
    expect(reasons).toEqual([
      'No sign-in is asking who.',
      'No sign-in is asking who.',
    ]);
  });

  it('a newer sign-in ends the one waiting, with nobody', async () => {
    const [first, after] = await run((world) =>
      Effect.gen(function* () {
        const older = yield* asking(world);
        const newer = yield* asking(world);
        const first = yield* Fiber.join(older);
        yield* signInAs(world, 'ada');
        yield* Fiber.join(newer);
        return [first, yield* current] as const;
      }),
    );
    expect(Exit.isSuccess(first)).toBe(true);
    expect(after).toEqual(['ada@kestack.test *']);
  });

  it('refuses one more Account past the most the browser holds', async () => {
    const users = ['a', 'b', 'c', 'd', 'e'].map((name) =>
      fakeUser({ email: `${name}@kestack.test` })!,
    );
    const exit = await run(
      () =>
        Effect.gen(function* () {
          const accounts = yield* Accounts;
          yield* accounts.check;
          return yield* Effect.exit(accounts.signIn());
        }),
      { start: { accounts: users, active: users[0]!.id, asking: null } },
    );
    expect(exit).toMatchObject({
      _tag: 'Failure',
      cause: {
        reasons: [{ error: { _tag: 'AccountLimitReached', limit: 5 } }],
      },
    });
  });

  it('withdraws a sign-in the app gives up on', async () => {
    const asked = await run((world) =>
      Effect.gen(function* () {
        const fiber = yield* asking(world);
        yield* Fiber.interrupt(fiber);
        return (yield* stateOf(world))?.asking;
      }),
    );
    expect(asked).toBeNull();
  });

  it('a switch and a sign-out asked here land in its state', async () => {
    const [switched, signedOut, state] = await run((world) =>
      Effect.gen(function* () {
        const accounts = yield* Accounts;
        yield* signedInAs(world, 'ada', 'bob');
        const ada = (yield* stateOf(world))!.accounts[0]!.id;
        yield* accounts.switchTo(ada);
        const switched = yield* current;
        yield* accounts.signOut();
        return [switched, yield* current, yield* stateOf(world)] as const;
      }),
    );
    expect(switched).toEqual(['ada@kestack.test *', 'bob@kestack.test']);
    expect(signedOut).toEqual(['bob@kestack.test *']);
    expect(state?.accounts.map(({ email }) => email)).toEqual([
      'bob@kestack.test',
    ]);
  });

  it('with a cache, starts Checking the Account last kept, then answers', async () => {
    const cache = Memory.make(browserAccountsTable).layer;
    await run((world) => signedInAs(world, 'ada'), { cache });
    // A world of its own this time: the Auth Worker has nobody for this browser.
    const [first, settled] = await run(
      () =>
        Effect.gen(function* () {
          const first = yield* Effect.flatMap(
            Accounts,
            ({ current }) => current,
          );
          const settled = yield* Effect.flatMap(Accounts, ({ state }) =>
            state.pipe(
              Stream.filter(({ _tag }) => _tag !== 'Checking'),
              Stream.runHead,
            ),
          );
          return [first, settled] as const;
        }),
      { cache },
    );
    expect(first).toMatchObject({
      _tag: 'Checking',
      last: { email: 'ada@kestack.test' },
    });
    expect(settled).toMatchObject({ value: { _tag: 'SignedOut' } });
  });
});
