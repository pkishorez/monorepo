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
import { PocketRpc } from '../../../apis/pocket/index.ts';
import { Store } from '@kestack/std-toolkit/replica/memory';
import { Pages, router } from '../index.ts';

/*
 * The APIs page through an Account Switch made in the header: it reads who
 * the calls go as from `CurrentAccount`, keeps the panels' answers, dimmed,
 * while the switch shows, and starts them over once the new Account is in.
 * How a switch is timed is the Account Switcher's own, tested in
 * web-platform.
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
  // The root page runs Replicas; this page reads none.
  Layer.succeed(PocketRpc, {} as PocketRpc['Service']),
  Store.memory(),
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
const switcher = (app: Running<unknown>) =>
  walk(app.snapshot()).find((each) => each.actor === 'AccountSwitcher')!;
const model = (app: Running<unknown>) =>
  apis(app).model as {
    readonly caller: { readonly _tag: string; readonly id?: string };
    readonly switching: boolean;
    readonly http: { readonly public: { readonly _tag: string } };
  };
const switchTo = (app: Running<unknown>, id: string) =>
  app.send(switcher(app).id, { _tag: 'SwitchTo', id } as never);

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

describe('an Account Switch, on the APIs page', () => {
  it('calls go as the Active Account', () =>
    run(
      Effect.gen(function* () {
        const { app } = yield* opened;
        expect(model(app).caller).toEqual({
          _tag: 'SignedIn',
          id: 'ada',
          email: 'ada@x.com',
        });
      }),
    ));

  it('dims the panels once it shows, keeps their answers, then starts them over for the new Account', () =>
    run(
      Effect.gen(function* () {
        const { app, answer } = yield* opened;
        switchTo(app, 'bob');
        yield* wait(50);
        expect(model(app).switching).toBe(false);
        yield* wait(150);
        expect(model(app).switching).toBe(true);
        yield* answer(true);
        yield* wait(50);
        // Answered, but shown only a moment ago: the minimum is waited out.
        expect(model(app).caller.id).toBe('ada');
        expect(model(app).http.public._tag).toBe('Answered');
        yield* wait(350);
        expect(model(app).switching).toBe(false);
        expect(model(app).caller.id).toBe('bob');
        expect(model(app).http.public._tag).toBe('Idle');
      }),
    ));

  it('one that fails keeps the Account and its answers', () =>
    run(
      Effect.gen(function* () {
        const { app, answer } = yield* opened;
        switchTo(app, 'bob');
        yield* wait(20);
        yield* answer(false);
        yield* wait(20);
        expect(model(app).switching).toBe(false);
        expect(model(app).caller.id).toBe('ada');
        expect(model(app).http.public._tag).toBe('Answered');
      }),
    ));
});
