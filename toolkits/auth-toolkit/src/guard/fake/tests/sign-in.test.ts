import { Effect, Exit, Fiber, Layer, type Scope, Stream } from 'effect';
import { Runtime } from '@kestack/kabuki';
import { Memory } from '@kestack/std-toolkit/db/memory';
import { describe, expect, it, vi } from 'vitest';
import { Accounts, type AccountsState } from '../../client/accounts/index.js';
import { browserAccountsTable } from '../../client/browser/index.js';
import {
  browserOver,
  type FakeBrowserOptions,
  signIn,
  type SignInMessage,
} from '../index.js';

/*
 * The Sign-in fake's Controls, as the app sees them: each lands in the
 * fake's Model, and the app's Accounts, the real client over it, change as
 * they would over the real Auth Worker.
 */

type Fake = Runtime<typeof signIn.actor>;

/** The Sign-in fake running, and the app's Accounts over it. */
const run = <A, E>(
  body: (fake: Fake) => Effect.Effect<A, E, Accounts | Scope.Scope>,
  options?: FakeBrowserOptions,
) =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const fake = yield* Runtime.scoped(signIn.actor);
        const accounts = yield* Layer.build(
          options === undefined
            ? signIn.serve(fake)
            : browserOver(fake, options),
        );
        return yield* body(fake).pipe(Effect.provideContext(accounts));
      }),
    ),
  );

const control = (fake: Fake, message: SignInMessage) =>
  Effect.sync(() => fake.root.send(message));

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

/** The app's state once it says `want`. */
const until = (want: (state: AccountsState) => boolean) =>
  Effect.flatMap(Accounts, ({ state }) =>
    state.pipe(Stream.filter(want), Stream.runHead),
  ).pipe(
    Effect.map((found) => (found._tag === 'Some' ? shown(found.value) : null)),
  );

/** Starts a sign-in, and waits until the fake asks who. */
const asking = (fake: Fake) =>
  Effect.gen(function* () {
    const accounts = yield* Accounts;
    const fiber = yield* Effect.forkChild(Effect.exit(accounts.signIn()));
    yield* Effect.orDie(fake.root.until(({ model }) => model.asking !== null));
    return fiber;
  });

/** Signs in as each email in turn, through the bubble's Control. */
const signedInAs = (fake: Fake, ...emails: ReadonlyArray<string>) =>
  Effect.forEach(
    emails,
    (email) =>
      Effect.gen(function* () {
        const fiber = yield* asking(fake);
        yield* control(fake, { _tag: 'SignInAs', email, name: '' });
        return yield* Fiber.join(fiber);
      }),
    { discard: true },
  );

describe('the Sign-in fake', () => {
  it('starts blank: nobody signed in', async () => {
    expect(
      await run(() =>
        Effect.flatMap(Accounts, ({ check }) => Effect.map(check, shown)),
      ),
    ).toBe('SignedOut');
  });

  it('holds a sign-in in its Model until it is told who, then the app has them', async () => {
    const [waiting, exit, after, model] = await run((fake) =>
      Effect.gen(function* () {
        const fiber = yield* asking(fake);
        const waiting = fake.root.model.asking;
        yield* control(fake, {
          _tag: 'SignInAs',
          email: 'Ada@Kestack.Test',
          name: 'Ada',
        });
        const exit = yield* Fiber.join(fiber);
        return [waiting, exit, yield* current, fake.root.model] as const;
      }),
    );
    expect(waiting).toMatchObject({ adding: false });
    expect(Exit.isSuccess(exit)).toBe(true);
    expect(after).toEqual(['ada@kestack.test *']);
    expect(model).toMatchObject({
      asking: null,
      accounts: [{ email: 'ada@kestack.test', name: 'Ada' }],
    });
  });

  it('asks again on a page after a reload, never taking an answer an earlier page had', async () => {
    const [waiting, after] = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const fake = yield* Runtime.scoped(signIn.actor);
          // The first page signs Ada in, and is gone.
          const first = yield* Layer.build(signIn.serve(fake)).pipe(
            Effect.scoped,
          );
          yield* signedInAs(fake, 'ada').pipe(Effect.provideContext(first));
          // The page after the reload adds an Account: it waits to be told who.
          const next = yield* Layer.build(signIn.serve(fake));
          return yield* Effect.gen(function* () {
            const fiber = yield* asking(fake);
            yield* Effect.sleep(10);
            const waiting = fiber.pollUnsafe() === undefined;
            yield* control(fake, {
              _tag: 'SignInAs',
              email: 'grace',
              name: '',
            });
            yield* Fiber.join(fiber);
            return [waiting, yield* current] as const;
          }).pipe(Effect.provideContext(next));
        }),
      ),
    );
    expect(waiting).toBe(true);
    expect(after).toEqual(['ada@kestack.test', 'grace@kestack.test *']);
  });

  it('leaves for where a sign-in comes back to as it is told, once the answer is in the Model', async () => {
    vi.stubGlobal('window', {
      location: { href: 'https://app.example.com/a/ada' },
    });
    const left: Array<[string, ReadonlyArray<string>]> = [];
    let running: Fake | undefined;
    await run(
      (fake) =>
        Effect.gen(function* () {
          running = fake;
          const fiber = yield* asking(fake);
          yield* control(fake, { _tag: 'SignInAs', email: 'ada', name: '' });
          yield* Effect.sleep(10);
          // The page is leaving: the sign-in never ends here.
          expect(fiber.pollUnsafe()).toBeUndefined();
          yield* Fiber.interrupt(fiber);
        }),
      {
        returnTo: 'https://app.example.com/',
        leave: (to) => {
          const accounts = running?.root.model.accounts ?? [];
          left.push([to, accounts.map(({ email }) => email)]);
        },
      },
    ).finally(() => vi.unstubAllGlobals());
    expect(left).toEqual([['https://app.example.com/', ['ada@kestack.test']]]);
  });

  it('signs you@kestack.test in for a blank email, and a bare name at kestack.test', async () => {
    expect(
      await run((fake) =>
        Effect.andThen(signedInAs(fake, '', 'grace'), current),
      ),
    ).toEqual(['you@kestack.test', 'grace@kestack.test *']);
  });

  it('adds an Account beside the others, and asks as adding', async () => {
    const [adding, after] = await run((fake) =>
      Effect.gen(function* () {
        yield* signedInAs(fake, 'ada');
        const fiber = yield* asking(fake);
        const adding = fake.root.model.asking?.adding;
        yield* control(fake, { _tag: 'SignInAs', email: 'bob', name: '' });
        yield* Fiber.join(fiber);
        return [adding, yield* current] as const;
      }),
    );
    expect(adding).toBe(true);
    expect(after).toEqual(['ada@kestack.test', 'bob@kestack.test *']);
  });

  it('cancelled, the sign-in ends with nobody and nothing changes', async () => {
    const [exit, after] = await run((fake) =>
      Effect.gen(function* () {
        yield* signedInAs(fake, 'ada');
        const fiber = yield* asking(fake);
        yield* control(fake, { _tag: 'CancelSignIn' });
        return [yield* Fiber.join(fiber), yield* current] as const;
      }),
    );
    expect(Exit.isSuccess(exit)).toBe(true);
    expect(after).toEqual(['ada@kestack.test *']);
  });

  it('fails a sign-in told an email outside kestack.test', async () => {
    const [exit, after] = await run((fake) =>
      Effect.gen(function* () {
        const fiber = yield* asking(fake);
        yield* control(fake, {
          _tag: 'SignInAs',
          email: 'ada@example.com',
          name: '',
        });
        return [yield* Fiber.join(fiber), yield* current] as const;
      }),
    );
    expect(exit).toMatchObject({
      _tag: 'Failure',
      cause: { reasons: [{ error: { _tag: 'AuthWorkerRejected' } }] },
    });
    expect(after).toBe('SignedOut');
  });

  it('refuses one more Account past the most the browser holds', async () => {
    const exit = await run(
      (fake) =>
        Effect.gen(function* () {
          yield* signedInAs(fake, 'ada');
          return yield* Effect.exit(
            Effect.flatMap(Accounts, (accounts) => accounts.signIn()),
          );
        }),
      { maxAccounts: 1 },
    );
    expect(exit).toMatchObject({
      _tag: 'Failure',
      cause: {
        reasons: [{ error: { _tag: 'AccountLimitReached', limit: 1 } }],
      },
    });
  });

  it('withdraws a sign-in the app gives up on', async () => {
    const asked = await run((fake) =>
      Effect.gen(function* () {
        const fiber = yield* asking(fake);
        yield* Fiber.interrupt(fiber);
        return fake.root.model.asking;
      }),
    );
    expect(asked).toBeNull();
  });

  it('a switch and a sign-out asked here land in its Model', async () => {
    const [switched, signedOut, model] = await run((fake) =>
      Effect.gen(function* () {
        const accounts = yield* Accounts;
        yield* signedInAs(fake, 'ada', 'bob');
        const ada = fake.root.model.accounts[0]!.id;
        yield* accounts.switchTo(ada);
        const switched = yield* current;
        yield* accounts.signOut();
        return [switched, yield* current, fake.root.model] as const;
      }),
    );
    expect(switched).toEqual(['ada@kestack.test *', 'bob@kestack.test']);
    expect(signedOut).toEqual(['bob@kestack.test *']);
    expect(model.accounts.map(({ email }) => email)).toEqual([
      'bob@kestack.test',
    ]);
  });

  it('with a cache, starts Checking the Account last kept, then answers', async () => {
    const cache = Memory.make(browserAccountsTable).layer;
    await run((fake) => signedInAs(fake, 'ada'), { cache });
    // A blank fake this time: the Auth Worker has nobody for this browser.
    const [first, settled] = await run(
      () =>
        Effect.gen(function* () {
          const first = yield* Effect.flatMap(
            Accounts,
            ({ current }) => current,
          );
          return [
            first,
            yield* until((state) => state._tag !== 'Checking'),
          ] as const;
        }),
      { cache },
    );
    expect(first).toMatchObject({
      _tag: 'Checking',
      last: { email: 'ada@kestack.test' },
    });
    expect(settled).toBe('SignedOut');
  });

  it('keeps no sign-in asking across a reload', async () => {
    const kept = await run((fake) =>
      Effect.gen(function* () {
        yield* asking(fake);
        return signIn.kept(fake.snapshot).root.model;
      }),
    );
    expect(kept.asking).toBeNull();
  });
});
