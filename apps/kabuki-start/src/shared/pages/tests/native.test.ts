import { Effect, Layer, Option, Stream } from 'effect';
import type { Scope } from 'effect';
import { Runtime } from '@kestack/kabuki';
import { View } from '@kestack/kabuki/react';
import { Loading, Router } from '@kestack/kabuki/routing';
import type { Instance } from '@kestack/kabuki/types';
import { Accounts, AccountsState } from '@kestack/auth-toolkit/client';
import { AppInfo } from '@kestack/web-platform/capabilities/app-info';
import { Haptics } from '@kestack/web-platform/capabilities/haptics';
import { LiveActivity } from '@kestack/web-platform/capabilities/live-activity';
import { Store } from '@kestack/std-toolkit/replica/memory';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HelloHttp } from '../../../apis/hello-http/index.ts';
import { HelloRpc } from '../../../apis/hello-rpc/index.ts';
import { PocketRpc } from '../../../apis/pocket/index.ts';
import { AppTheme, Pages, router } from '../index.ts';

/*
 * The Native page with fake `AppInfo`, `Haptics` and `LiveActivity`, as an
 * app's Shell on iOS would provide them: it shows what they say, a
 * button's Command says whether the device took its haptic, the Live
 * Activity starts, moves on and ends, and `?proof` runs all three haptics
 * by itself and logs one line, starting a Live Activity too with `live=1`.
 * With none provided, the page has the web's. Node has no service worker,
 * so it is `unsupported` throughout. `done` lists what the fakes were
 * asked, in order, the Theme set by `AppTheme` among them.
 */

const shell = {
  id: 'app.kishore.start',
  name: 'Kabuki Start',
  version: '1.2.0',
  build: '7',
};

let done: Array<string> = [];

const ios = Layer.mergeAll(
  Layer.succeed(AppInfo, {
    platform: 'ios',
    shell: Effect.succeed(Option.some(shell)),
  }),
  // The engine takes a tap and a selection, and refuses a notification.
  Layer.succeed(Haptics, {
    impact: () => Effect.sync(() => (done.push('impact'), true)),
    notify: () => Effect.succeed(false),
    selection: Effect.succeed(true),
  }),
  Layer.succeed(LiveActivity, {
    supported: Effect.succeed(true),
    start: (activity) =>
      Effect.sync(() => {
        done.push(`start ${JSON.stringify(activity)}`);
        return Option.some('activity-1');
      }),
    update: (id, change) =>
      Effect.sync(
        () => (done.push(`update ${id} ${JSON.stringify(change)}`), true),
      ),
    end: (id) => Effect.sync(() => (done.push(`end ${id}`), true)),
  }),
  Layer.succeed(AppTheme, {
    set: (theme) => Effect.sync(() => void done.push(`theme ${theme}`)),
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
    readonly live: {
      readonly supported: string;
      readonly state: string;
      readonly id: string | null;
      readonly progress: number;
    };
    readonly proof: string;
  };

const proofLines = (log: {
  readonly mock: { readonly calls: Array<Array<unknown>> };
}) =>
  log.mock.calls
    .map(([line]) => String(line))
    .filter((line) => line.startsWith('[native-proof] '));

const open = (url: string, capabilities: Layer.Layer<never> = ios) =>
  Effect.gen(function* () {
    const runtime = yield* Runtime.scoped(Root.actor, {
      input: Root.startAt(url),
      layer: Layer.mergeAll(loading, app, capabilities),
    });
    yield* wait(30);
    return runtime;
  });

afterEach(() => {
  vi.restoreAllMocks();
  done = [];
});

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
        expect(proofLines(log)).toEqual([
          `[native-proof] ${JSON.stringify({
            platform: 'ios',
            shell,
            serviceWorker: 'unsupported',
            haptics: { impact: true, notify: false, selection: true },
            liveActivity: { supported: true, id: null },
          })}`,
        ]);
        // Without live=1 no Live Activity starts, and without theme the Theme stays.
        expect(done).toEqual(['impact']);
        expect(model(runtime).live.state).toBe('idle');
      }),
    ));

  it('sets the Theme first and leaves a Live Activity running with ?proof&live=1&theme=light', () =>
    run(
      Effect.gen(function* () {
        const log = vi.spyOn(console, 'log').mockImplementation(() => {});
        const runtime = yield* open('/native?proof=1&live=1&theme=light');
        const activity = {
          title: 'Kabuki Start',
          status: 'Proving the Dynamic Island',
          progress: 0.4,
        };
        expect(done).toEqual([
          'theme light',
          'impact',
          `start ${JSON.stringify(activity)}`,
        ]);
        expect(model(runtime).live).toEqual({
          supported: 'yes',
          state: 'running',
          id: 'activity-1',
          progress: 0.4,
        });
        expect(proofLines(log)).toEqual([
          `[native-proof] ${JSON.stringify({
            platform: 'ios',
            shell,
            serviceWorker: 'unsupported',
            haptics: { impact: true, notify: false, selection: true },
            liveActivity: { supported: true, id: 'activity-1' },
          })}`,
        ]);
      }),
    ));

  it("logs no id with ?proof&live=1 where the web's starts none", () =>
    run(
      Effect.gen(function* () {
        const log = vi.spyOn(console, 'log').mockImplementation(() => {});
        const runtime = yield* open('/native?proof=1&live=1', Layer.empty);
        expect(model(runtime).live).toEqual({
          supported: 'no',
          state: 'unsupported',
          id: null,
          progress: 0,
        });
        expect(proofLines(log)).toHaveLength(1);
        expect(proofLines(log)[0]).toContain(
          '"liveActivity":{"supported":false,"id":null}',
        );
      }),
    ));

  it('sets no Theme without ?proof', () =>
    run(
      Effect.gen(function* () {
        yield* open('/native?theme=light&live=1');
        expect(done).toEqual([]);
      }),
    ));

  it('starts a Live Activity, moves it on and ends it', () =>
    run(
      Effect.gen(function* () {
        const runtime = yield* open('/native');
        const page = runtime.at(native(runtime).address);
        expect(model(runtime).live).toEqual({
          supported: 'yes',
          state: 'idle',
          id: null,
          progress: 0,
        });
        page?.send({ _tag: 'LiveStart' });
        yield* wait(20);
        expect(model(runtime).live).toMatchObject({
          state: 'running',
          id: 'activity-1',
        });
        page?.send({ _tag: 'LiveUpdate' });
        yield* wait(20);
        page?.send({ _tag: 'LiveUpdate' });
        yield* wait(20);
        expect(model(runtime).live.progress).toBe(0.5);
        page?.send({ _tag: 'LiveEnd' });
        yield* wait(20);
        expect(model(runtime).live).toEqual({
          supported: 'yes',
          state: 'ended',
          id: 'activity-1',
          progress: 0.5,
        });
        expect(done).toEqual([
          `start ${JSON.stringify({ title: 'Kabuki Start', status: '0% there', progress: 0 })}`,
          `update activity-1 ${JSON.stringify({ status: '25% there', progress: 0.25 })}`,
          `update activity-1 ${JSON.stringify({ status: '50% there', progress: 0.5 })}`,
          'end activity-1',
        ]);
      }),
    ));

  it("is unsupported, and starts nothing, with the web's", () =>
    run(
      Effect.gen(function* () {
        const runtime = yield* open('/native', Layer.empty);
        runtime.at(native(runtime).address)?.send({ _tag: 'LiveStart' });
        yield* wait(20);
        expect(model(runtime).live).toEqual({
          supported: 'no',
          state: 'unsupported',
          id: null,
          progress: 0,
        });
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
