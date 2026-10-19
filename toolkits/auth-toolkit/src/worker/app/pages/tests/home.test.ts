import { Effect } from 'effect';
import type { Running } from '@kestack/kabuki';
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
 * The Home Page's removals answer for the Account they were asked for: one
 * that lands after an Account Switch hides nothing of the Account shown now.
 */

const model = (app: Running<unknown>) =>
  find(app, 'Home')!.model as {
    readonly pending: ReadonlyArray<string>;
    readonly removed: ReadonlyArray<string>;
    readonly confirming: boolean;
  };

/** The Sign-in ids the Home Page draws: its data, less what it hides. */
const drawn = (app: Running<unknown>) =>
  ((shownData(app, 'Home')?.signIns ?? []) as ReadonlyArray<{ id: string }>)
    .map(({ id }) => id)
    .filter((id) => !model(app).removed.includes(id));

/** Switches to Grace from this tab's Account menu, as the user does. */
const switchToGrace = (app: Running<unknown>) =>
  sendTo(app, 'App', {
    _tag: 'SwitchChosen',
    userId: 'grace',
    email: 'grace@acme.dev',
  });

describe('a removal that lands after an Account Switch', () => {
  it('signing out everywhere else: hides none of the new Account’s Sign-ins', () =>
    run(
      Effect.gen(function* () {
        const tab = harness(twoAccounts());
        const app = yield* tab.open('/');
        yield* settle;
        const answer = tab.holdAction('revokeOthers');
        sendTo(app, 'Home', { _tag: 'ConfirmOpened' });
        sendTo(app, 'Home', { _tag: 'OthersRevokeConfirmed' });
        yield* wait(10);
        switchToGrace(app);
        yield* settle;
        expect(shownData(app, 'Home')?.accounts.active).toBe('grace');
        answer();
        yield* settle;
        expect(drawn(app)).toEqual(['grace-here', 'grace-laptop']);
        expect(model(app).pending).toEqual([]);
      }),
    ));

  it('signing out of one place, or removing an app: nothing changes for the new Account', () =>
    run(
      Effect.gen(function* () {
        const tab = harness(twoAccounts());
        tab.server.grants.ada = [
          {
            id: 'ada-claude',
            client: { id: 'c', name: 'Claude', icon: null, uri: null },
            scopes: [],
            grantedAt: '2026-10-01T00:00:00.000Z',
          },
        ];
        const app = yield* tab.open('/');
        yield* settle;
        const signedOut = tab.holdAction('revokeSignIn');
        const removed = tab.holdAction('revokeGrant');
        sendTo(app, 'Home', { _tag: 'SignInRevokeChosen', id: 'ada-laptop' });
        sendTo(app, 'Home', { _tag: 'GrantRevokeChosen', id: 'ada-claude' });
        yield* wait(10);
        switchToGrace(app);
        yield* settle;
        const loads = tab.calls['Home'];
        signedOut();
        removed();
        yield* settle;
        expect(drawn(app)).toEqual(['grace-here', 'grace-laptop']);
        expect(model(app)).toEqual({
          pending: [],
          removed: [],
          confirming: false,
        });
        // Nothing of Grace's was changed: nothing is loaded again for it.
        expect(tab.calls['Home']).toBe(loads);
      }),
    ));
});
