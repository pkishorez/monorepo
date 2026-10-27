import { Deferred, Effect, Fiber, type Scope, Stream } from 'effect';
import { describe, expect, it } from 'vitest';
import { AccountsState, AuthWorkerUnavailable } from '../../accounts/index.js';
import { makeAccounts, type Snapshot, type Source } from '../index.js';

const ada = {
  id: 'ada',
  email: 'ada@x.com',
  name: 'Ada',
  image: null,
  test: false,
};
const bob = {
  id: 'bob',
  email: 'bob@x.com',
  name: 'Bob',
  image: null,
  test: false,
};

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

  it('marks an Account whose email ends in .test as a Test User', async () => {
    const tess = {
      id: 'tess',
      email: 'Tess@Example.TEST',
      name: 'Tess',
      image: null,
    };
    const { source } = fakeSource({ active: tess.id, accounts: [tess, ada] });
    const state = await run(
      Effect.gen(function* () {
        const { accounts } = yield* makeAccounts({
          source,
          last: null,
          checkOnStart: false,
        });
        return yield* accounts.check;
      }),
    );
    expect(state).toEqual(
      AccountsState.SignedIn({
        active: { ...tess, test: true },
        accounts: [{ ...tess, test: true }, ada],
      }),
    );
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

  it('remembers the last Account signed in through a signed-out answer while it is shown', async () => {
    const kept: Snapshot[] = [];
    const signedIn: Snapshot = { active: ada.id, accounts: [ada] };
    const signedOut: Snapshot = { active: null, accounts: [] };
    let answer = signedIn;
    const fake = fakeSource(signedIn);
    const source: Source = {
      ...fake.source,
      read: Effect.sync(() => answer),
    };
    const states = await run(
      Effect.gen(function* () {
        const { accounts, settle } = yield* makeAccounts({
          source,
          last: signedIn,
          checkOnStart: false,
          keep: (snapshot) => Effect.sync(() => void kept.push(snapshot)),
        });
        yield* settle;
        // An Auth Worker restarting answers signed out for a moment.
        answer = signedOut;
        const out = yield* accounts.check;
        answer = signedIn;
        return [out, yield* accounts.check] as const;
      }),
    );
    expect(states).toEqual([
      AccountsState.SignedOut(),
      AccountsState.SignedIn({ active: ada, accounts: [ada] }),
    ]);
    expect(kept).toEqual([signedIn]);
  });

  it('forgets the last Account signed in as the check made while it is shown answers signed out', async () => {
    const kept: Snapshot[] = [];
    const { source } = fakeSource({ active: null, accounts: [] });
    await run(
      Effect.gen(function* () {
        const { settle } = yield* makeAccounts({
          source,
          last: { active: ada.id, accounts: [ada] },
          checkOnStart: true,
          keep: (snapshot) => Effect.sync(() => void kept.push(snapshot)),
        });
        yield* settle;
      }),
    );
    expect(kept).toEqual([{ active: null, accounts: [] }]);
  });

  it('forgets the last Account signed in on a sign-out asked here, and keeps the next one signed in', async () => {
    const kept: Snapshot[] = [];
    const { source } = fakeSource({ active: ada.id, accounts: [ada, bob] });
    await run(
      Effect.gen(function* () {
        const { accounts } = yield* makeAccounts({
          source,
          last: { active: ada.id, accounts: [ada, bob] },
          checkOnStart: false,
          keep: (snapshot) => Effect.sync(() => void kept.push(snapshot)),
        });
        yield* accounts.signOut(ada.id);
        yield* accounts.signOut(bob.id);
        yield* accounts.signIn();
        yield* accounts.signOutAll;
      }),
    );
    expect(kept).toEqual([
      { active: bob.id, accounts: [bob] },
      { active: null, accounts: [] },
      { active: bob.id, accounts: [ada, bob] },
      { active: null, accounts: [] },
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

  /** A Source whose switches wait until `answer` is opened, and fail when
   * `refuse` is set. */
  const slowSwitch = (initial: Snapshot) =>
    Effect.gen(function* () {
      const fake = fakeSource(initial);
      const answer = yield* Deferred.make<void>();
      let refuse = false;
      let asked = 0;
      const source: Source = {
        ...fake.source,
        switchTo: (userId) =>
          Effect.gen(function* () {
            asked++;
            yield* Deferred.await(answer);
            if (refuse)
              return yield* Effect.fail(
                new AuthWorkerUnavailable({
                  url: 'https://auth.test',
                  kind: 'unreachable',
                }),
              );
            return yield* fake.source.switchTo(userId);
          }),
      };
      return {
        source,
        reads: fake.reads,
        asked: () => asked,
        answer: Deferred.succeed(answer, undefined),
        refuse: () => {
          refuse = true;
        },
      };
    });

  const both = { active: ada.id, accounts: [ada, bob] };
  const signedInAs = (active: typeof ada) =>
    AccountsState.SignedIn({ active, accounts: [ada, bob] });

  it('shows a switch under way as switchingTo, then the new Active Account', async () => {
    const states = await run(
      Effect.gen(function* () {
        const slow = yield* slowSwitch(both);
        const { accounts } = yield* makeAccounts({
          source: slow.source,
          last: both,
          checkOnStart: false,
        });
        const seen = yield* Effect.forkChild(
          accounts.state.pipe(Stream.take(3), Stream.runCollect),
        );
        yield* Effect.yieldNow;
        const switching = yield* Effect.forkChild(accounts.switchTo(bob.id));
        yield* Effect.yieldNow;
        const during = yield* accounts.current;
        yield* slow.answer;
        yield* Fiber.join(switching);
        return [during, ...(yield* Fiber.join(seen))];
      }),
    );
    expect(states).toEqual([
      AccountsState.SignedIn({
        active: ada,
        accounts: [ada, bob],
        switchingTo: bob,
      }),
      signedInAs(ada),
      AccountsState.SignedIn({
        active: ada,
        accounts: [ada, bob],
        switchingTo: bob,
      }),
      signedInAs(bob),
    ]);
  });

  it('a switch that fails leaves the state as it was, and fails', async () => {
    const [states, error] = await run(
      Effect.gen(function* () {
        const slow = yield* slowSwitch(both);
        const { accounts } = yield* makeAccounts({
          source: slow.source,
          last: both,
          checkOnStart: false,
        });
        const seen = yield* Effect.forkChild(
          accounts.state.pipe(Stream.take(3), Stream.runCollect),
        );
        yield* Effect.yieldNow;
        slow.refuse();
        const switching = yield* Effect.forkChild(
          Effect.flip(accounts.switchTo(bob.id)),
        );
        yield* Effect.yieldNow;
        yield* slow.answer;
        const failed = yield* Fiber.join(switching);
        return [yield* Fiber.join(seen), failed._tag] as const;
      }),
    );
    expect(states).toEqual([
      signedInAs(ada),
      AccountsState.SignedIn({
        active: ada,
        accounts: [ada, bob],
        switchingTo: bob,
      }),
      signedInAs(ada),
    ]);
    expect(error).toBe('AuthWorkerUnavailable');
  });

  it('of two switches under way, shows the newest until the last is answered', async () => {
    const carol = {
      id: 'carol',
      email: 'carol@x.com',
      name: 'Carol',
      image: null,
      test: false,
    };
    const three = { active: ada.id, accounts: [ada, bob, carol] };
    const [during, after] = await run(
      Effect.gen(function* () {
        const slow = yield* slowSwitch(three);
        const { accounts } = yield* makeAccounts({
          source: slow.source,
          last: three,
          checkOnStart: false,
        });
        const first = yield* Effect.forkChild(accounts.switchTo(bob.id));
        yield* Effect.yieldNow;
        const second = yield* Effect.forkChild(accounts.switchTo(carol.id));
        yield* Effect.yieldNow;
        const during = yield* accounts.current;
        yield* slow.answer;
        yield* Fiber.join(first);
        yield* Fiber.join(second);
        return [during, yield* accounts.current] as const;
      }),
    );
    expect(during).toEqual(
      AccountsState.SignedIn({
        active: ada,
        accounts: [ada, bob, carol],
        switchingTo: carol,
      }),
    );
    expect(after).toEqual(
      AccountsState.SignedIn({ active: carol, accounts: [ada, bob, carol] }),
    );
  });

  it('never sends a switch a newer one replaced before its turn', async () => {
    const carol = {
      id: 'carol',
      email: 'carol@x.com',
      name: 'Carol',
      image: null,
      test: false,
    };
    const three = { active: ada.id, accounts: [ada, bob, carol] };
    const [after, asked] = await run(
      Effect.gen(function* () {
        const slow = yield* slowSwitch(three);
        const { accounts } = yield* makeAccounts({
          source: slow.source,
          last: three,
          checkOnStart: false,
        });
        const sent = yield* Effect.forkChild(accounts.switchTo(bob.id));
        yield* Effect.yieldNow;
        const replaced = yield* Effect.forkChild(accounts.switchTo(ada.id));
        yield* Effect.yieldNow;
        const newest = yield* Effect.forkChild(accounts.switchTo(carol.id));
        yield* Effect.yieldNow;
        yield* slow.answer;
        yield* Fiber.join(sent);
        yield* Fiber.join(replaced);
        yield* Fiber.join(newest);
        return [yield* accounts.current, slow.asked()] as const;
      }),
    );
    expect(after).toEqual(
      AccountsState.SignedIn({ active: carol, accounts: [ada, bob, carol] }),
    );
    expect(asked).toBe(2);
  });

  it('checks, rather than trust it, a peer’s Snapshot that came during a switch', async () => {
    const [state, reads] = await run(
      Effect.gen(function* () {
        const slow = yield* slowSwitch(both);
        let apply: (snapshot: Snapshot) => Effect.Effect<void> = () =>
          Effect.void;
        const { accounts } = yield* makeAccounts({
          source: slow.source,
          last: both,
          checkOnStart: false,
          connect: (peers) =>
            Effect.sync(() => {
              apply = peers.apply;
              return { announce: () => Effect.void };
            }),
        });
        const switching = yield* Effect.forkChild(accounts.switchTo(bob.id));
        yield* Effect.yieldNow;
        // Another tab saw Ada active before this switch reached the server.
        const told = yield* Effect.forkChild(apply(both));
        yield* Effect.yieldNow;
        yield* slow.answer;
        yield* Fiber.join(switching);
        yield* Fiber.join(told);
        return [yield* accounts.current, slow.reads()] as const;
      }),
    );
    expect(state).toEqual(signedInAs(bob));
    expect(reads).toBe(1);
  });

  it('still checks a peer’s Snapshot when a switch queued behind another is stopped', async () => {
    const [state, reads] = await run(
      Effect.gen(function* () {
        const slow = yield* slowSwitch(both);
        let apply: (snapshot: Snapshot) => Effect.Effect<void> = () =>
          Effect.void;
        const { accounts } = yield* makeAccounts({
          source: slow.source,
          last: both,
          checkOnStart: false,
          connect: (peers) =>
            Effect.sync(() => {
              apply = peers.apply;
              return { announce: () => Effect.void };
            }),
        });
        const sent = yield* Effect.forkChild(accounts.switchTo(bob.id));
        yield* Effect.yieldNow;
        const queued = yield* Effect.forkChild(accounts.switchTo(ada.id));
        yield* Effect.yieldNow;
        yield* Fiber.interrupt(queued);
        // Another tab saw Ada active before Bob's switch reached the server.
        const told = yield* Effect.forkChild(apply(both));
        yield* Effect.yieldNow;
        yield* slow.answer;
        yield* Fiber.join(sent);
        yield* Fiber.join(told);
        return [yield* accounts.current, slow.reads()] as const;
      }),
    );
    expect(state).toEqual(signedInAs(bob));
    expect(reads).toBe(1);
  });
});
