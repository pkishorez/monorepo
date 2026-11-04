import { Account as page, AccountLive } from './actor.ts';
import { AccountView, Switcher } from './view.tsx';

/**
 * The Account's page, `/a/:accountId`: its definition, its build, its
 * View, and where the root page hands it the Account Switcher.
 */
export const Account = {
  page,
  actor: AccountLive,
  view: AccountView,
  Switcher: Switcher.Provider,
};
