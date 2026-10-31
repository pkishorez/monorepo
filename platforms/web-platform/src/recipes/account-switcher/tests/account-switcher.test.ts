import {
  Deferred,
  Effect,
  Layer,
  Schema,
  Stream,
  SubscriptionRef,
} from 'effect';
import type { Scope } from 'effect';
import { Actor, Command, Runtime } from '@kestack/kabuki';
import type { Running } from '@kestack/kabuki/core/runtime';
import type { Instance } from '@kestack/kabuki/core/snapshot';
import {
  type Account,
  Accounts,
  AccountsState,
  AuthWorkerUnavailable,
} from '@kestack/auth-toolkit/client';
import { describe, expect, it } from 'vitest';
import { AccountSwitcherLive, CurrentAccount } from '../index.ts';

/*
 * The Account Switcher under a root that Provides `CurrentAccount`, beside
 * a page that reads it: a switch shows only once under way a moment, stays
 * the minimum once shown, and swaps the new Account in one step; one action
 * at a time; and a page reads and asks through `CurrentAccount`.
 */

const ada: Account = {
  id: 'ada',
  email: 'ada@x.com',
  name: 'Ada',
  image: null,
  test: false,
};
const bob: Account = {
  id: 'bob',
  email: 'bob@x.com',
  name: 'Bob',
  image: null,
  test: false,
};
const both = AccountsState.SignedIn({ active: ada, accounts: [ada, bob] });

/** `Accounts` as auth-toolkit's are, each switch and sign-out held until `answer`. */
const fakeAccounts = Effect.gen(function* () {
  const ref = yield* SubscriptionRef.make<AccountsState>(both);
  let answer = yield* Deferred.make<boolean>();
  /** Waits for `answer`: a refusal puts `before` back and fails. */
  const held = (before: AccountsState, after: AccountsState) =>
    Effect.gen(function* () {
      if (!(yield* Deferred.await(answer))) {
        yield* SubscriptionRef.set(ref, before);
        return yield* new AuthWorkerUnavailable({
          url: 'https://auth.test',
          kind: 'unreachable',
        });
      }
      yield* SubscriptionRef.set(ref, after);
    });
  const asked: Array<string> = [];
  const accounts = Accounts.of({
    state: SubscriptionRef.changes(ref),
    current: SubscriptionRef.get(ref),
    check: SubscriptionRef.get(ref),
    signIn: () => Effect.sync(() => void asked.push('signIn')),
    signOut: () =>
      Effect.gen(function* () {
        asked.push('signOut');
        yield* held(
          yield* SubscriptionRef.get(ref),
          AccountsState.SignedIn({ active: bob, accounts: [bob] }),
        );
      }),
    signOutAll: Effect.gen(function* () {
      asked.push('signOutAll');
      yield* held(yield* SubscriptionRef.get(ref), AccountsState.SignedOut());
    }),
    switchTo: (userId) =>
      Effect.gen(function* () {
        asked.push(`switchTo ${userId}`);
        const to = userId === bob.id ? bob : ada;
        yield* SubscriptionRef.set(
          ref,
          AccountsState.SignedIn({
            active: ada,
            accounts: [ada, bob],
            switchingTo: to,
          }),
        );
        yield* held(
          both,
          AccountsState.SignedIn({ active: to, accounts: [ada, bob] }),
        );
      }),
  });
  return {
    layer: Layer.succeed(Accounts, accounts),
    asked,
    answer: (ok: boolean) =>
      Effect.gen(function* () {
        yield* Deferred.succeed(answer, ok);
        answer = yield* Deferred.make<boolean>();
      }),
  };
});

/** A page that keeps what `CurrentAccount` says, and asks it for a switch. */
const Page = Actor.define('Page', {
  requires: [CurrentAccount],
  model: Schema.Struct({ seen: Schema.Array(Schema.String) }),
  message: Schema.TaggedUnion({
    Seen: { what: Schema.String },
    Ask: { id: Schema.String },
  }),
});

const ask = Command.make('ask', {
  args: Schema.Struct({ id: Schema.String }),
  run: ({ id }) => Effect.flatMap(CurrentAccount, (a) => a.switchTo(id)),
});

const PageLive = Page.build({
  init: () => ({ model: { seen: [] } }),
  workers: {
    follow: {
      run: (self) =>
        Effect.flatMap(CurrentAccount, ({ state }) =>
          Stream.runForEach(state, ({ account, switching }) =>
            self.send({
              _tag: 'Seen',
              what: `${account._tag === 'SignedIn' ? account.active.id : account._tag}${switching ? ` > ${switching.id}` : ''}`,
            }),
          ),
        ),
    },
  },
  on: {
    Seen: ({ what }, { model }) => ({
      model: { seen: [...model.seen, what] },
    }),
    Ask: ({ id }) => ({ command: ask({ id }) }),
  },
});

const Root = Actor.define('Root', {}).build({
  provides: () => CurrentAccount.layer,
  children: {
    account: Actor.child(AccountSwitcherLive, {
      input: () => ({ maxAccounts: 5 }),
    }),
    page: Actor.child(PageLive),
  },
});

const wait = (ms: number) =>
  Effect.promise(() => new Promise((done) => setTimeout(done, ms)));
const run = <A>(effect: Effect.Effect<A, never, Scope.Scope>) =>
  Effect.runPromise(Effect.scoped(effect));

const walk = (at: Instance): ReadonlyArray<Instance> => [
  at,
  ...Object.values(at.children).flatMap((child) =>
    ((Array.isArray(child) ? child : [child]) as Array<Instance>).flatMap(walk),
  ),
];
const find = (app: Running<unknown>, actor: string) =>
  walk(app.snapshot()).find((each) => each.actor === actor)!;

type Model = {
  readonly account: { readonly _tag: string; readonly active?: Account };
  readonly switching: {
    readonly id: string;
    readonly shownAt: number | null;
  } | null;
  readonly busy: string | null;
  readonly failed: string | null;
};
const model = (app: Running<unknown>) =>
  find(app, 'AccountSwitcher').model as Model;
const active = (app: Running<unknown>) => {
  const { account } = model(app);
  return account.active?.id ?? account._tag;
};
const seen = (app: Running<unknown>) =>
  (find(app, 'Page').model as { seen: ReadonlyArray<string> }).seen;

const opened = Effect.gen(function* () {
  const accounts = yield* fakeAccounts;
  const app = yield* Runtime.start(Root, accounts.layer);
  yield* wait(20);
  const send = (message: { readonly _tag: string; readonly id?: string }) =>
    app.send(find(app, 'AccountSwitcher').id, message as never);
  return { app, send, ...accounts };
});

describe('an Account Switch', () => {
  it('shows after the delay, then swaps in the new Account after the minimum', () =>
    run(
      Effect.gen(function* () {
        const { app, send, answer } = yield* opened;
        expect(active(app)).toBe('ada');
        send({ _tag: 'SwitchTo', id: 'bob' });
        yield* wait(50);
        expect(model(app).switching).toMatchObject({
          id: 'bob',
          shownAt: null,
        });
        expect(seen(app).at(-1)).toBe('ada');
        yield* wait(150);
        expect(model(app).switching?.shownAt).not.toBeNull();
        expect(seen(app).at(-1)).toBe('ada > bob');
        yield* answer(true);
        yield* wait(50);
        // Answered, but shown only a moment ago: it waits out the minimum.
        expect(active(app)).toBe('ada');
        yield* wait(350);
        expect(model(app).switching).toBeNull();
        expect(model(app).busy).toBeNull();
        expect(active(app)).toBe('bob');
        expect(seen(app).at(-1)).toBe('bob');
      }),
    ));

  it('a quick one never shows', () =>
    run(
      Effect.gen(function* () {
        const { app, send, answer } = yield* opened;
        send({ _tag: 'SwitchTo', id: 'bob' });
        yield* wait(20);
        yield* answer(true);
        yield* wait(20);
        expect(model(app).switching).toBeNull();
        expect(active(app)).toBe('bob');
        expect(seen(app)).not.toContain('ada > bob');
      }),
    ));

  it('one that fails keeps the Account, and says why', () =>
    run(
      Effect.gen(function* () {
        const { app, send, answer } = yield* opened;
        send({ _tag: 'SwitchTo', id: 'bob' });
        yield* wait(20);
        yield* answer(false);
        yield* wait(20);
        expect(model(app).switching).toBeNull();
        expect(model(app).busy).toBeNull();
        expect(active(app)).toBe('ada');
        expect(model(app).failed).toMatch(
          /^Couldn't switch accounts\. .*https:\/\/auth\.test/,
        );
      }),
    ));
});

describe('one action at a time', () => {
  it('refuses another while a sign-out is under way, then frees up', () =>
    run(
      Effect.gen(function* () {
        const { app, send, answer, asked } = yield* opened;
        send({ _tag: 'SignOut' });
        yield* wait(20);
        expect(model(app).busy).toBe('ada');
        send({ _tag: 'SwitchTo', id: 'bob' });
        send({ _tag: 'SignOutAll' });
        send({ _tag: 'SignIn' });
        yield* wait(20);
        expect(asked).toEqual(['signOut']);
        yield* answer(true);
        yield* wait(20);
        expect(model(app).busy).toBeNull();
        expect(active(app)).toBe('bob');
      }),
    ));

  it('switches only to another signed-in Account', () =>
    run(
      Effect.gen(function* () {
        const { app, send, asked } = yield* opened;
        send({ _tag: 'SwitchTo', id: 'ada' });
        send({ _tag: 'SwitchTo', id: 'eve' });
        yield* wait(20);
        expect(asked).toEqual([]);
        expect(model(app).busy).toBeNull();
      }),
    ));
});

describe('CurrentAccount', () => {
  it("a page's Request reaches the Account Switcher as its own Message", () =>
    run(
      Effect.gen(function* () {
        const { app, asked } = yield* opened;
        app.send(find(app, 'Page').id, { _tag: 'Ask', id: 'bob' } as never);
        yield* wait(20);
        expect(asked).toEqual(['switchTo bob']);
        expect(model(app).switching?.id).toBe('bob');
      }),
    ));
});
