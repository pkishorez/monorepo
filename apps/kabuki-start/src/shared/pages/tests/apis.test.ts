import { Deferred, Effect, Layer, SubscriptionRef } from 'effect';
import type { Scope } from 'effect';
import { History, Runtime } from '@kestack/kabuki';
import type { Instance, Running } from '@kestack/kabuki';
import { View } from '@kestack/kabuki/react';
import { Router } from '@kestack/kabuki/routing';
import {
  type Account,
  Accounts,
  AccountsState,
  AuthWorkerUnreachable,
} from '@kestack/auth-toolkit/client';
import { describe, expect, it } from 'vitest';
import { HelloHttp } from '../../../apis/hello-http/index.ts';
import { HelloRpc } from '../../../apis/hello-rpc/index.ts';
import { Pages, router } from '../index.ts';

/*
 * The APIs page's account bar through an Account Switch: it shows only once
 * under way a moment, keeps the panels' answers while it does, and swaps
 * in the new Account, the panels starting over, in one step.
 */

const ada: Account = {
  id: 'ada',
  email: 'ada@x.com',
  name: 'Ada',
  image: null,
};
const bob: Account = {
  id: 'bob',
  email: 'bob@x.com',
  name: 'Bob',
  image: null,
};

/** `Accounts` as auth-toolkit's are, with each switch held until `answer`. */
const fakeAccounts = Effect.gen(function* () {
  const ref = yield* SubscriptionRef.make<AccountsState>(
    AccountsState.SignedIn({ active: ada, accounts: [ada, bob] }),
  );
  let answer = yield* Deferred.make<boolean>();
  const accounts = Accounts.of({
    state: SubscriptionRef.changes(ref),
    current: SubscriptionRef.get(ref),
    check: SubscriptionRef.get(ref),
    signIn: () => Effect.void,
    signOut: () => Effect.void,
    signOutAll: Effect.void,
    switchTo: (userId) =>
      Effect.gen(function* () {
        const before = AccountsState.SignedIn({
          active: ada,
          accounts: [ada, bob],
        });
        const to = userId === bob.id ? bob : ada;
        yield* SubscriptionRef.set(
          ref,
          AccountsState.SignedIn({
            active: ada,
            accounts: [ada, bob],
            switchingTo: to,
          }),
        );
        if (!(yield* Deferred.await(answer))) {
          yield* SubscriptionRef.set(ref, before);
          return yield* new AuthWorkerUnreachable({ url: 'https://auth.test' });
        }
        yield* SubscriptionRef.set(
          ref,
          AccountsState.SignedIn({ active: to, accounts: [ada, bob] }),
        );
      }),
  });
  return {
    layer: Layer.succeed(Accounts, accounts),
    answer: (ok: boolean) =>
      Effect.gen(function* () {
        yield* Deferred.succeed(answer, ok);
        answer = yield* Deferred.make<boolean>();
      }),
  };
});

const hello = { public: Effect.succeed('Hello') } as const;
const workers = Layer.mergeAll(
  Layer.succeed(HelloHttp, hello as unknown as HelloHttp['Service']),
  Layer.succeed(HelloRpc, hello as unknown as HelloRpc['Service']),
);

const Root = Router.app(
  router,
  View.make(Pages.AppLive, () => null),
);
const loading = Router.memory(
  router,
  router.loaders({
    Static: () => Effect.succeed({ at: 0 }),
    'Static.Dynamic': () => Effect.succeed({ at: 0 }),
    'Static.Dynamic.Client': () => Effect.succeed({ at: 0 }),
    Items: () => Effect.succeed({ items: [] }),
    'Items.Item': ({ id }) => Effect.succeed({ id, name: 'Item', at: 0 }),
  }),
);

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
const apis = (app: Running<unknown>) =>
  walk(app.snapshot()).find((each) => each.actor === 'Apis')!;
const model = (app: Running<unknown>) =>
  apis(app).model as {
    readonly account: { readonly _tag: string; readonly active?: Account };
    readonly switching: { readonly shownAt: number | null } | null;
    readonly switchFailed: string | null;
    readonly http: { readonly public: { readonly _tag: string } };
  };

const opened = Effect.gen(function* () {
  const accounts = yield* fakeAccounts;
  const app = yield* Runtime.start(
    History.make(Root.actor, { input: Root.startAt('/apis') }),
    Layer.mergeAll(loading, accounts.layer, workers),
  );
  yield* wait(20);
  app.send(apis(app).id, { _tag: 'Send', api: 'http', level: 'public' });
  yield* wait(20);
  expect(model(app).http.public._tag).toBe('Answered');
  return { app, answer: accounts.answer };
});

describe('an Account Switch on the APIs page', () => {
  it('shows after the delay, keeps the answers while shown, then swaps in the new Account after the minimum', () =>
    run(
      Effect.gen(function* () {
        const { app, answer } = yield* opened;
        app.send(apis(app).id, { _tag: 'SwitchTo', id: 'bob' });
        yield* wait(50);
        expect(model(app).switching).toMatchObject({ shownAt: null });
        yield* wait(150);
        expect(model(app).switching?.shownAt).not.toBeNull();
        yield* answer(true);
        yield* wait(50);
        // Answered, but shown only a moment ago: the bar waits out the minimum.
        expect(model(app).account.active?.id).toBe('ada');
        expect(model(app).http.public._tag).toBe('Answered');
        yield* wait(350);
        expect(model(app).switching).toBeNull();
        expect(model(app).account.active?.id).toBe('bob');
        expect(model(app).http.public._tag).toBe('Idle');
      }),
    ));

  it('a quick one never shows', () =>
    run(
      Effect.gen(function* () {
        const { app, answer } = yield* opened;
        app.send(apis(app).id, { _tag: 'SwitchTo', id: 'bob' });
        yield* wait(20);
        yield* answer(true);
        yield* wait(20);
        expect(model(app).switching).toBeNull();
        expect(model(app).account.active?.id).toBe('bob');
      }),
    ));

  it('one that fails keeps the Account and its answers, and says why', () =>
    run(
      Effect.gen(function* () {
        const { app, answer } = yield* opened;
        app.send(apis(app).id, { _tag: 'SwitchTo', id: 'bob' });
        yield* wait(20);
        yield* answer(false);
        yield* wait(20);
        expect(model(app).switching).toBeNull();
        expect(model(app).account.active?.id).toBe('ada');
        expect(model(app).http.public._tag).toBe('Answered');
        expect(model(app).switchFailed).toContain('https://auth.test');
      }),
    ));
});
