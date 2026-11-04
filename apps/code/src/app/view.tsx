import { View } from '@kestack/kabuki/react';
import {
  AccountSwitcherList,
  AccountSwitcherView,
} from '@kestack/web-platform/recipes/account-switcher';
import { Account } from './account/index.ts';
import { NowhereScreen, StartScreen } from './sign-in/index.ts';
import { AppLive, nowhere, placeOf, shownOf, startOf } from './actor.ts';

/*
 * The root page's View, as the Account step goes: an address that names
 * no page says so, whoever is signed in; else the mark, signing in, or
 * checking who is, while no Account is active; else the Account's page
 * the URL names, handed the Account Switcher for its header and its list
 * for the sidebar's foot. The mark stays while the app moves from `/`, or
 * an address it had before, to its place under the Account active, and
 * from a page under its guess to the same page under the Account the Auth
 * Worker answered.
 */

export const AppView = View.make(
  AppLive,
  ({ root, model, state, props, children, send }) => {
    if (nowhere(props.route))
      return (
        <div {...root}>
          <NowhereScreen />
        </div>
      );
    const active = shownOf(state);
    if (
      active === null ||
      placeOf(state, props.route, model.placed) !== null ||
      children.Account === undefined
    )
      return (
        <div {...root}>
          <StartScreen
            start={active === null ? startOf(state) : 'reading'}
            problem={model.signInProblem}
            leaving={model.signingIn}
            onSignIn={() => send({ _tag: 'SignInAsked' })}
          />
        </div>
      );
    return (
      <div {...root}>
        <Account.Switcher
          value={{
            account: <AccountSwitcherView instance={children.account} />,
            accounts: <AccountSwitcherList instance={children.account} />,
          }}
        >
          <Account.view instance={children.Account} />
        </Account.Switcher>
      </div>
    );
  },
);
