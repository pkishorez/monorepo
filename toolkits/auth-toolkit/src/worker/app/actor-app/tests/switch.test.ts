import { Effect } from 'effect';
import type { Runtime } from '@kestack/kabuki';
import { describe, expect, it } from 'vitest';
import {
  find,
  harness,
  run,
  sendTo,
  settle,
  shownData,
  twoAccounts,
  wait,
} from './harness.ts';

/*
 * An Account Switch from this tab's Account menu is one transition: the
 * page shown stays, dimmed once the switch has been under way a moment,
 * until the new Account's data takes its place; it never blanks into a
 * loading screen in between.
 */

type Switching = {
  readonly userId: string;
  readonly shownAt: number | null;
  readonly step: string;
} | null;

const root = (app: Runtime.Running<unknown>) =>
  find(app, 'App')!.model as {
    readonly busy: string | null;
    readonly switching: Switching;
    readonly toasts: ReadonlyArray<{ readonly text: string }>;
  };

const homeStatus = (app: Runtime.Running<unknown>) =>
  (
    find(app, 'Home')?.props as
      | { readonly status: { readonly _tag: string } }
      | undefined
  )?.status._tag;

const choose = (app: Runtime.Running<unknown>, userId: string) =>
  sendTo(app, 'App', {
    _tag: 'SwitchChosen',
    userId,
    email: `${userId}@acme.dev`,
  });

describe('an Account Switch from the Account menu', () => {
  it('a slow one shows after the delay, holds the page shown, and swaps in the new data in one step', () =>
    run(
      Effect.gen(function* () {
        const tab = harness(twoAccounts());
        const app = yield* tab.open('/');
        yield* settle;
        const confirm = tab.holdAction('switchTo');
        const load = tab.hold('Home');
        choose(app, 'grace');
        yield* wait(50);
        // Under way, not shown yet.
        expect(root(app).switching).toMatchObject({ shownAt: null });
        yield* wait(150);
        expect(root(app).switching?.shownAt).not.toBeNull();
        confirm();
        yield* wait(600);
        // Confirmed, the new data still on its way: Ada's page stays.
        expect(root(app).switching?.step).toBe('confirmed');
        expect(homeStatus(app)).toBe('Ready');
        expect(shownData(app, 'Home')?.accounts.active).toBe('ada');
        load();
        yield* wait(50);
        expect(homeStatus(app)).toBe('Ready');
        expect(shownData(app, 'Home')?.accounts.active).toBe('grace');
        expect(root(app).switching).toBeNull();
        expect(root(app).busy).toBeNull();
        expect(root(app).toasts.map(({ text }) => text)).toEqual([
          'Switched to grace@acme.dev',
        ]);
      }),
    ));

  it('a quick one never shows', () =>
    run(
      Effect.gen(function* () {
        const tab = harness(twoAccounts());
        const app = yield* tab.open('/');
        yield* settle;
        choose(app, 'grace');
        yield* wait(100);
        expect(root(app).switching).toBeNull();
        expect(shownData(app, 'Home')?.accounts.active).toBe('grace');
      }),
    ));

  it('once shown, stays shown the minimum, though it lands at once', () =>
    run(
      Effect.gen(function* () {
        const tab = harness(twoAccounts());
        const app = yield* tab.open('/');
        yield* settle;
        const confirm = tab.holdAction('switchTo');
        choose(app, 'grace');
        yield* wait(170);
        expect(root(app).switching?.shownAt).not.toBeNull();
        confirm();
        yield* wait(50);
        expect(shownData(app, 'Home')?.accounts.active).toBe('grace');
        expect(root(app).switching?.step).toBe('landed');
        yield* wait(350);
        expect(root(app).switching).toBeNull();
      }),
    ));

  it('one that fails keeps the Account shown, and says why', () =>
    run(
      Effect.gen(function* () {
        const tab = harness(twoAccounts());
        const app = yield* tab.open('/');
        yield* settle;
        const loads = tab.calls['Home'];
        choose(app, 'nobody');
        yield* settle;
        expect(root(app).switching).toBeNull();
        expect(root(app).busy).toBeNull();
        expect(root(app).toasts.map(({ text }) => text)).toEqual([
          'That account is not signed in on this browser.',
        ]);
        expect(shownData(app, 'Home')?.accounts.active).toBe('ada');
        expect(tab.calls['Home']).toBe(loads);
      }),
    ));

  it('asks nothing more while one is under way', () =>
    run(
      Effect.gen(function* () {
        const tab = harness(twoAccounts());
        const app = yield* tab.open('/');
        yield* settle;
        const confirm = tab.holdAction('switchTo');
        choose(app, 'grace');
        sendTo(app, 'App', {
          _tag: 'SignOutChosen',
          userId: 'ada',
          email: 'ada@acme.dev',
        });
        confirm();
        yield* settle;
        expect(tab.server.accounts.map(({ id }) => id)).toEqual([
          'ada',
          'grace',
        ]);
        expect(shownData(app, 'Home')?.accounts.active).toBe('grace');
      }),
    ));
});
