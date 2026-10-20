import { Page, Router } from '@kestack/kabuki/routing';
import {
  AccountSwitcherLive,
  CurrentAccount,
} from '@kestack/web-platform/account-switcher';
import { Apis, ApisLive } from './apis.ts';
import { ItemLive, Items, ItemsLive } from './items.ts';
import { ClientLive, DynamicLive, Static, StaticLive } from './rendering.ts';

/*
 * The root page, with the three pages under it, and the router read down
 * from it. Both sides import this: the server for the router its Loaders
 * are checked against, the browser for every page's build its Views draw.
 * The root page also holds the Account Switcher, which its View draws in
 * the header, and Provides every page `CurrentAccount`.
 */

const App = Page.define({
  metadata: { meta: [{ property: 'og:site_name', content: 'Kabuki Start' }] },
  pages: { Static, Items, Apis },
});

const AppLive = Page.build(App, {
  pages: { Static: StaticLive, Items: ItemsLive, Apis: ApisLive },
  provides: () => CurrentAccount.layer,
  children: {
    // The Auth Worker's `maxAccounts`: its default, 5.
    account: { actor: AccountSwitcherLive, input: () => ({ maxAccounts: 5 }) },
  },
});

export const router = Router.define(App, {
  notFound: { title: 'Not found · Kabuki Start', robots: 'noindex' },
  scrollRestoration: true,
});

/** Every page's build, for its View. */
export const Pages = {
  AppLive,
  StaticLive,
  DynamicLive,
  ClientLive,
  ItemsLive,
  ItemLive,
  ApisLive,
};

/** A place's dotted name, as the router writes it: `Static.Dynamic`. */
export type Place = typeof router.place.Type;
