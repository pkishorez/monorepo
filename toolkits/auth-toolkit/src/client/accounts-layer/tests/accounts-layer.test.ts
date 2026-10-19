import { Deferred, Effect, Fiber, type Scope, Stream } from 'effect';
import { describe, expect, it } from 'vitest';
import { AccountsState } from '../../accounts/index.js';
import { makeAccounts, type Snapshot, type Source } from '../index.js';

const ada = { id: 'ada', email: 'ada@x.com', name: 'Ada', image: null };
const bob = { id: 'bob', email: 'bob@x.com', name: 'Bob', image: null };

const fakeSource = (initial: Snapshot) => {
  let snapshot = initial;
  let reads = 0;
  const set = (next: Snapshot) =>
    Effect.sync(() => {
      snapshot = next;
      return next;
    });
  const source: Source = {
    read: Effect.sync(() => {
      reads++;
      return snapshot;
    }),
    signIn: () => set({ active: bob.id, accounts: [ada, bob] }),
    switchTo: (userId) => set({ ...snapshot, active: userId }),
    signOut: (userId) => {
      const accounts = snapshot.accounts.filter(({ id }) => id !== userId);
      return set({ active: accounts[0]?.id ?? null, accounts });
    },
    signOutAll: set({ active: null, accounts: [] }),
  };
  return { source, reads: () => reads };
};

const run = <A, E>(effect: Effect.Effect<A, E, Scope.Scope>) =>
  Effect.runPromise(Effect.scoped(effect));

describe('makeAccounts', () => {
  it('starts Checking with what it last knew, then confirms', async () => {
    const { source } = fakeSource({ active: bob.id, accounts: [ada, bob] });
    const states = await run(
      Effect.gen(function* () {
        const { accounts } = yield* makeAccounts({
          source,
          last: { active: ada.id, accounts: [ada] },
          checkOnStart: true,
        });
        return yield* accounts.state.pipe(Stream.take(2), Stream.runCollect);
      }),
    );
    expect(states).toEqual([
      AccountsState.Checking({ last: ada }),
      AccountsState.SignedIn({ active: bob, accounts: [ada, bob] }),
    ]);
  });

  it('starts Checking with nothing when it knew nothing', async () => {
    const { source } = fakeSource({ active: null, accounts: [] });
    const [first] = await run(
      Effect.gen(function* () {
        const { accounts } = yield* makeAccounts({
          source,
          last: null,
          checkOnStart: true,
        });
        return yield* accounts.state.pipe(Stream.take(2), Stream.runCollect);
      }),
    );
    expect(first).toEqual(AccountsState.Checking({}));
  });

  it('trusts what it knew without checking on start', async () => {
    const fake = fakeSource({ active: ada.id, accounts: [ada] });
    const state = await run(
      Effect.gen(function* () {
        const { accounts } = yield* makeAccounts({
          source: fake.source,
          last: { active: ada.id, accounts: [ada] },
          checkOnStart: false,
        });
        return yield* accounts.current;
      }),
    );
    expect(state).toEqual(
      AccountsState.SignedIn({ active: ada, accounts: [ada] }),
    );
    expect(fake.reads()).toBe(0);
  });

  it('moves through sign-in, switch, sign-out and sign-out-all', async () => {
    const { source } = fakeSource({ active: ada.id, accounts: [ada] });
    const seen = await run(
      Effect.gen(function* () {
        const { accounts } = yield* makeAccounts({
          source,
          last: { active: ada.id, accounts: [ada] },
          checkOnStart: false,
        });
        const states = [];
        yield* accounts.signIn();
        states.push(yield* accounts.current);
        yield* accounts.switchTo(ada.id);
        states.push(yield* accounts.current);
        yield* accounts.signOut();
        states.push(yield* accounts.current);
        yield* accounts.signOutAll;
        states.push(yield* accounts.current);
        // Nobody to sign out is nothing to do.
        yield* accounts.signOut();
        return states;
      }),
    );
    expect(seen).toEqual([
      AccountsState.SignedIn({ active: bob, accounts: [ada, bob] }),
      AccountsState.SignedIn({ active: ada, accounts: [ada, bob] }),
      AccountsState.SignedIn({ active: bob, accounts: [bob] }),
      AccountsState.SignedOut(),
    ]);
  });

  it('settles with one check however many ask while Checking', async () => {
    const fake = fakeSource({ active: ada.id, accounts: [ada] });
    await run(
      Effect.gen(function* () {
        const { settle } = yield* makeAccounts({
          source: fake.source,
          last: null,
          checkOnStart: true,
        });
        yield* Effect.all([settle, settle, settle], { concurrency: 3 });
      }),
    );
    expect(fake.reads()).toBe(1);
  });

  it('tells its peers of a change, and takes theirs without telling back', async () => {
    const { source } = fakeSource({ active: ada.id, accounts: [ada] });
    const announced: Snapshot[] = [];
    const state = await run(
      Effect.gen(function* () {
        let apply: (snapshot: Snapshot) => Effect.Effect<void> = () =>
          Effect.void;
        const { accounts } = yield* makeAccounts({
          source,
          last: { active: ada.id, accounts: [ada] },
          checkOnStart: false,
          connect: (peers) =>
            Effect.sync(() => {
              apply = peers.apply;
              return {
                announce: (snapshot) =>
                  Effect.sync(() => void announced.push(snapshot)),
              };
            }),
        });
        // Unchanged: nothing to tell.
        yield* accounts.check;
        yield* accounts.signIn();
        yield* apply({ active: null, accounts: [] });
        return yield* accounts.current;
      }),
    );
    expect(announced).toEqual([{ active: bob.id, accounts: [ada, bob] }]);
    expect(state).toEqual(AccountsState.SignedOut());
  });

  /** A Source whose next read sees who is signed in now but answers only
   * once `answer` is opened: a check slower than what follows it. */
  const slowRead = (initial: Snapshot) =>
    Effect.gen(function* () {
      const fake = fakeSource(initial);
      const answer = yield* Deferred.make<void>();
      const started = yield* Deferred.make<void>();
      let slow = true;
      const source: Source = {
        ...fake.source,
        read: Effect.gen(function* () {
          const seen = yield* fake.source.read;
          if (slow) {
            slow = false;
            yield* Deferred.succeed(started, undefined);
            yield* Deferred.await(answer);
          }
          return seen;
        }),
      };
      return { source, answer, started };
    });

  it('keeps an action a slower check started before it would undo', async () => {
    const announced: Snapshot[] = [];
    const kept: Snapshot[] = [];
    const [state, last] = await run(
      Effect.gen(function* () {
        const { source, answer, started } = yield* slowRead({
          active: ada.id,
          accounts: [ada, bob],
        });
        const { accounts } = yield* makeAccounts({
          source,
          last: { active: ada.id, accounts: [ada, bob] },
          checkOnStart: false,
          keep: (snapshot) => Effect.sync(() => void kept.push(snapshot)),
          connect: () =>
            Effect.succeed({
              announce: (snapshot) =>
                Effect.sync(() => void announced.push(snapshot)),
            }),
        });
        const checking = yield* Effect.forkChild(accounts.check);
        yield* Deferred.await(started);
        const switching = yield* Effect.forkChild(accounts.switchTo(bob.id));
        yield* Effect.yieldNow;
        yield* Deferred.succeed(answer, undefined);
        yield* Fiber.join(checking);
        yield* Fiber.join(switching);
        return [yield* accounts.current, announced.at(-1)] as const;
      }),
    );
    expect(state).toEqual(
      AccountsState.SignedIn({ active: bob, accounts: [ada, bob] }),
    );
    expect(last).toEqual({ active: bob.id, accounts: [ada, bob] });
    expect(kept.at(-1)).toEqual({ active: bob.id, accounts: [ada, bob] });
  });

  it('keeps what a peer said over a slower check started before it', async () => {
    const state = await run(
      Effect.gen(function* () {
        const { source, answer, started } = yield* slowRead({
          active: ada.id,
          accounts: [ada],
        });
        let apply: (snapshot: Snapshot) => Effect.Effect<void> = () =>
          Effect.void;
        const { accounts } = yield* makeAccounts({
          source,
          last: { active: ada.id, accounts: [ada] },
          checkOnStart: false,
          connect: (peers) =>
            Effect.sync(() => {
              apply = peers.apply;
              return { announce: () => Effect.void };
            }),
        });
        const checking = yield* Effect.forkChild(accounts.check);
        yield* Deferred.await(started);
        const told = yield* Effect.forkChild(
          apply({ active: null, accounts: [] }),
        );
        yield* Effect.yieldNow;
        yield* Deferred.succeed(answer, undefined);
        yield* Fiber.join(checking);
        yield* Fiber.join(told);
        return yield* accounts.current;
      }),
    );
    expect(state).toEqual(AccountsState.SignedOut());
  });
});
