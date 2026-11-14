import { Effect, Layer, Option, Stream } from 'effect';
import type { Scope } from 'effect';
import { Runtime } from '@kestack/kabuki';
import { View } from '@kestack/kabuki/react';
import { Loading, Router } from '@kestack/kabuki/routing';
import type { Instance } from '@kestack/kabuki/types';
import { Accounts, AccountsState } from '@kestack/auth-toolkit/client';
import { AppInfo } from '@kestack/web-platform/capabilities/app-info';
import { Haptics } from '@kestack/web-platform/capabilities/haptics';
import { Store } from '@kestack/std-toolkit/replica/memory';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HelloHttp } from '../../../apis/hello-http/index.ts';
import { HelloRpc } from '../../../apis/hello-rpc/index.ts';
import { PocketRpc } from '../../../apis/pocket/index.ts';
import { Pages, router } from '../index.ts';

/*
 * The Native page with fake `AppInfo` and `Haptics`, as an app's Shell on
 * iOS would provide them: it shows what they say, a button's Command says
 * whether the device took its haptic, and `?proof` runs all three by
 * itself and logs one line. With neither provided, the page has the web's.
 * Node has no service worker, so it is `unsupported` throughout.
 */

const shell = {
  id: 'app.kishore.start',
  name: 'Kabuki Start',
  version: '1.2.0',
  build: '7',
};

const ios = Layer.mergeAll(
  Layer.succeed(AppInfo, {
    platform: 'ios',
    shell: Effect.succeed(Option.some(shell)),
  }),
  // The engine takes a tap and a selection, and refuses a notification.
  Layer.succeed(Haptics, {
    impact: () => Effect.succeed(true),
    notify: () => Effect.succeed(false),
    selection: Effect.succeed(true),
  }),
);

const signedOut = Layer.succeed(
  Accounts,
  Accounts.of({
    state: Stream.never,
    current: Effect.succeed(AccountsState.SignedOut()),
    check: Effect.succeed(AccountsState.SignedOut()),
    signIn: () => Effect.void,
    signOut: () => Effect.void,
    signOutAll: Effect.void,
    switchTo: () => Effect.void,
  }),
);

const app = Layer.mergeAll(
  signedOut,
  Layer.succeed(HelloHttp, {} as HelloHttp['Service']),
  Layer.succeed(HelloRpc, {} as HelloRpc['Service']),
  Layer.succeed(PocketRpc, {} as PocketRpc['Service']),
  Store.memory(),
);

const Root = Router.view(
  router,
  View.make(Pages.AppLive, () => null),
);
const loading = Loading.memory(
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
const native = (runtime: Runtime) =>
  walk(runtime.snapshot.root).find((each) => each.actor === 'Native')!;
const model = (runtime: Runtime) =>
  native(runtime).model as {
    readonly app: { readonly _tag: string };
    readonly serviceWorker: string;
    readonly results: Readonly<Record<string, string>>;
    readonly proof: string;
  };

const open = (url: string, capabilities: Layer.Layer<never> = ios) =>
  Effect.gen(function* () {
    const runtime = yield* Runtime.scoped(Root.actor, {
      input: Root.startAt(url),
      layer: Layer.mergeAll(loading, app, capabilities),
    });
    yield* wait(30);
    return runtime;
  });

afterEach(() => vi.restoreAllMocks());

describe('the Native page', () => {
  it('shows the platform and the Shell AppInfo says', () =>
    run(
      Effect.gen(function* () {
        const runtime = yield* open('/native');
        expect(model(runtime).app).toEqual({
          _tag: 'Known',
          platform: 'ios',
          shell,
        });
        expect(model(runtime).serviceWorker).toBe('unsupported');
      }),
    ));

  it("is the web's, with no Shell, when the app provides neither", () =>
    run(
      Effect.gen(function* () {
        const runtime = yield* open('/native', Layer.empty);
        expect(model(runtime).app).toEqual({
          _tag: 'Known',
          platform: 'web',
          shell: null,
        });
        // Node has no navigator.vibrate, so the web's Haptics refuses.
        runtime
          .at(native(runtime).address)
          ?.send({ _tag: 'Buzz', kind: 'impact' });
        yield* wait(20);
        expect(model(runtime).results.impact).toBe('refused');
      }),
    ));

  it("says whether the device took a button's haptic", () =>
    run(
      Effect.gen(function* () {
        const runtime = yield* open('/native');
        const page = runtime.at(native(runtime).address);
        expect(model(runtime).results.impact).toBe('idle');
        page?.send({ _tag: 'Buzz', kind: 'impact' });
        page?.send({ _tag: 'Buzz', kind: 'notify' });
        yield* wait(20);
        expect(model(runtime).results).toEqual({
          impact: 'took',
          notify: 'refused',
          selection: 'idle',
        });
      }),
    ));

  it('runs each haptic by itself with ?proof, and logs one line', () =>
    run(
      Effect.gen(function* () {
        const log = vi.spyOn(console, 'log').mockImplementation(() => {});
        const runtime = yield* open('/native?proof=1');
        expect(model(runtime).proof).toBe('done');
        expect(model(runtime).results).toEqual({
          impact: 'took',
          notify: 'refused',
          selection: 'took',
        });
        const lines = log.mock.calls
          .map(([line]) => String(line))
          .filter((line) => line.startsWith('[native-proof] '));
        expect(lines).toEqual([
          `[native-proof] ${JSON.stringify({
            platform: 'ios',
            shell,
            serviceWorker: 'unsupported',
            haptics: { impact: true, notify: false, selection: true },
          })}`,
        ]);
      }),
    ));

  it('runs nothing by itself and logs nothing without ?proof', () =>
    run(
      Effect.gen(function* () {
        const log = vi.spyOn(console, 'log').mockImplementation(() => {});
        const runtime = yield* open('/native');
        expect(model(runtime).proof).toBe('idle');
        expect(model(runtime).results.selection).toBe('idle');
        expect(
          log.mock.calls.some(([line]) =>
            String(line).startsWith('[native-proof]'),
          ),
        ).toBe(false);
      }),
    ));
});
