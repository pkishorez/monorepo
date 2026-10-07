import { Effect, Fiber, Layer } from 'effect';
import { Memory } from '@kstackz/std-toolkit/db/memory';
import { describe, expect, it } from 'vitest';
import { nameToken } from '../../../../contract/index.js';
import { SignIn } from '../../../account/index.js';
import {
  named,
  type NamedChoice,
  namedAccountsTable,
  namedChooser,
} from '../named.js';

/** Signs in whoever is next in line, as a test's stand-in for a dialog. */
const queue = (...choices: Array<NamedChoice | null>) =>
  Effect.sync(() => choices.shift() ?? null);

const run = <A, E>(
  effect: Effect.Effect<A, E, SignIn>,
  layer: Layer.Layer<SignIn> = named({ choose: queue() }),
) => Effect.runPromise(effect.pipe(Effect.provide(layer)));

const emails = (accounts: ReadonlyArray<{ user: { email: string } }>) =>
  accounts.map(({ user }) => user.email);

describe('named', () => {
  it('signs in whoever was chosen and makes them the Active Account', async () => {
    const listed = await run(
      Effect.gen(function* () {
        const accounts = yield* SignIn;
        yield* accounts.signIn();
        yield* accounts.signIn();
        return yield* accounts.list;
      }),
      named({
        choose: queue(
          { email: 'Ada@Demo' },
          { email: 'bob@demo', name: 'Bob' },
        ),
      }),
    );
    expect(
      listed.map(({ user, active }) => [user.email, user.name, active]),
    ).toEqual([
      ['ada@demo', 'ada', false],
      ['bob@demo', 'Bob', true],
    ]);
    expect(nameToken.read(listed[1]!.token)).toEqual({
      id: listed[1]!.user.id,
      email: 'bob@demo',
      name: 'Bob',
    });
  });

  it('signs nobody in when nobody was chosen', async () => {
    const listed = await run(
      Effect.gen(function* () {
        const accounts = yield* SignIn;
        yield* accounts.signIn();
        return yield* accounts.list;
      }),
      named({ choose: queue(null) }),
    );
    expect(listed).toEqual([]);
  });

  it('signing in an account again only makes it active', async () => {
    const listed = await run(
      Effect.gen(function* () {
        const accounts = yield* SignIn;
        yield* accounts.signIn();
        yield* accounts.signIn();
        yield* accounts.signIn();
        return yield* accounts.list;
      }),
      named({
        choose: queue(
          { email: 'ada@demo' },
          { email: 'bob@demo' },
          { email: 'ada@demo' },
        ),
      }),
    );
    expect(emails(listed)).toEqual(['bob@demo', 'ada@demo']);
    expect(listed.find(({ active }) => active)?.user.email).toBe('ada@demo');
  });

  it('switches, and signing out the Active Account makes another active', async () => {
    const [switched, signedOut, none] = await run(
      Effect.gen(function* () {
        const accounts = yield* SignIn;
        yield* accounts.signIn();
        yield* accounts.signIn();
        const [ada] = yield* accounts.list;
        yield* accounts.switchTo(ada!.token);
        const switched = yield* accounts.list;
        yield* accounts.signOut(ada!.token);
        const signedOut = yield* accounts.list;
        yield* accounts.signOutAll;
        return [switched, signedOut, yield* accounts.list] as const;
      }),
      named({
        choose: queue({ email: 'ada@demo' }, { email: 'bob@demo' }),
      }),
    );
    expect(switched.find(({ active }) => active)?.user.email).toBe('ada@demo');
    expect(signedOut.map(({ user, active }) => [user.email, active])).toEqual([
      ['bob@demo', true],
    ]);
    expect(none).toEqual([]);
  });

  it('keeps Named Accounts in the storage it is given', async () => {
    const storage = Memory.make(namedAccountsTable).layer;
    await run(
      Effect.flatMap(SignIn, (accounts) => accounts.signIn()),
      named({ choose: queue({ email: 'ada@demo' }), storage }),
    );
    const listed = await run(
      Effect.flatMap(SignIn, (accounts) => accounts.list),
      named({ choose: queue(), storage }),
    );
    expect(emails(listed)).toEqual(['ada@demo']);
  });

  it('hands each account a Name Token naming its User', async () => {
    const [account] = await run(
      Effect.gen(function* () {
        const accounts = yield* SignIn;
        yield* accounts.signIn();
        return yield* accounts.list;
      }),
      named({ choose: queue({ email: 'ada@demo' }) }),
    );
    expect(nameToken.read(account!.token)).toMatchObject({
      id: account!.user.id,
      email: 'ada@demo',
    });
  });
});

describe('namedChooser', () => {
  it('waits for an answer while asking', async () => {
    const chooser = namedChooser();
    const seen: boolean[] = [];
    chooser.subscribe(() => seen.push(chooser.isAsking()));

    const answered = await Effect.runPromise(
      Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(chooser.choose);
        yield* Effect.yieldNow;
        expect(chooser.isAsking()).toBe(true);
        chooser.answer({ email: 'ada@demo' });
        return yield* Fiber.join(fiber);
      }),
    );

    expect(answered).toEqual({ email: 'ada@demo' });
    expect(chooser.isAsking()).toBe(false);
    expect(seen).toEqual([true, false]);
  });
});
