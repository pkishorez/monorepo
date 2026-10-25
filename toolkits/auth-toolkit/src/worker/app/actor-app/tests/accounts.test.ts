import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import { router } from '../routes.ts';
import {
  find,
  harness,
  run,
  sendRouter,
  settle,
  shownData,
  twoAccounts,
  wait,
} from './harness.ts';

/*
 * Another tab's Account Switch: this tab's pages never go on showing, or
 * keep for Back, data drawn for the Account that was active before.
 */

const activeShown = (app: Parameters<typeof shownData>[0], name: string) =>
  shownData(app, name)?.accounts.active;

describe('an Account Switch in another tab', () => {
  it('while the page is still loading: checked once its data arrives, and loaded anew', () =>
    run(
      Effect.gen(function* () {
        const tab = harness(twoAccounts());
        const open = tab.hold('Home');
        const app = yield* tab.open('/');
        yield* wait(200);
        expect(find(app, 'Home')).toBeDefined();
        expect(shownData(app, 'Home')).toBeUndefined();
        // Read for Ada, then Grace is switched to elsewhere and this tab is shown.
        tab.server.active = 'grace';
        tab.shown();
        yield* wait(10);
        open();
        yield* settle;
        expect(activeShown(app, 'Home')).toBe('grace');
        expect(shownData(app, 'Home')?.signIns[0]?.id).toBe('grace-here');
      }),
    ));

  it('during a load, then Back: the page before is not shown from its copy for the Account before', () =>
    run(
      Effect.gen(function* () {
        const tab = harness(twoAccounts());
        const app = yield* tab.open('/');
        yield* settle;
        expect(activeShown(app, 'Home')).toBe('ada');
        const open = tab.hold('Device');
        sendRouter(app, { _tag: 'Pushed', route: router.Device() });
        yield* wait(200);
        tab.server.active = 'grace';
        tab.shown();
        yield* wait(10);
        open();
        yield* settle;
        expect(activeShown(app, 'Device')).toBe('grace');
        tab.hold('Home');
        sendRouter(app, { _tag: 'Went', by: -1 });
        yield* wait(10);
        expect(activeShown(app, 'Home')).not.toBe('ada');
      }),
    ));

  it('with this tab in view: a copy the Data cache kept for the Account before is never shown', () =>
    run(
      Effect.gen(function* () {
        const tab = harness(twoAccounts());
        const app = yield* tab.open('/');
        yield* settle;
        sendRouter(app, { _tag: 'Pushed', route: router.Device() });
        yield* settle;
        // Another window, side by side: this tab is never hidden.
        tab.server.active = 'grace';
        const open = tab.hold('Home');
        sendRouter(app, { _tag: 'Went', by: -1 });
        yield* wait(10);
        expect(activeShown(app, 'Home')).not.toBe('ada');
        yield* wait(200);
        expect(activeShown(app, 'Home')).not.toBe('ada');
        open();
        yield* settle;
        expect(activeShown(app, 'Home')).toBe('grace');
      }),
    ));
});
