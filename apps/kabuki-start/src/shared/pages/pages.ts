import { Layer } from 'effect';
import { Page, Router } from '@kestack/kabuki/routing';
import { Replicas } from '@kestack/std-toolkit/replica';
import {
  AccountSwitcherLive,
  CurrentAccount,
} from '@kestack/web-platform/recipes/account-switcher';
import { Apis, ApisLive } from './apis.ts';
import { ItemLive, Items, ItemsLive } from './items.ts';
import { ClientLive, DynamicLive, Static, StaticLive } from './rendering.ts';
import {
  Entries,
  PocketLive,
  Replica,
  ReplicaLive,
  Wallets,
} from './replica/index.ts';
import { PocketLive as PocketReplica } from '../../replicas/pocket/index.ts';
import { Actor } from '@kestack/kabuki';

/*
 * The root page, with the four pages under it, and the router read down
 * from it. Both sides import this: the server for the router its Loaders
 * are checked against, the browser for every page's build its Views draw.
 * The root page also holds the Account Switcher, which its View draws in
 * the header, and Provides every page `CurrentAccount`. It runs Replicas
 * too, once for the whole app, so an Instance a page leaves runs on for its
 * GC Time, and another page reading it meanwhile finds it running.
 */

const App = Page.define({
  metadata: { meta: [{ property: 'og:site_name', content: 'Kabuki Start' }] },
  pages: { Static, Items, Apis, Replica },
});

const ReplicasLive = Replicas.actor([PocketReplica]);

const AppLive = App.build({
  pages: {
    Static: StaticLive,
    Items: ItemsLive,
    Apis: ApisLive,
    Replica: ReplicaLive,
  },
  provides: () => Layer.mergeAll(CurrentAccount.layer, Replicas.layer),
  children: {
    // The Auth Worker's `maxAccounts`: its default, 5.
    account: Actor.child(AccountSwitcherLive, {
      input: () => ({ maxAccounts: 5 }),
    }),
    replicas: Actor.child(ReplicasLive),
  },
});

export const router = Router.define(App, {
  notFound: { title: 'Not found · Kabuki Start', robots: 'noindex' },
  scrollRestoration: true,
});

/** Every page's build, and the actors the Replica page places and reads, for their Views. */
export const Pages = {
  AppLive,
  ReplicasLive,
  StaticLive,
  DynamicLive,
  ClientLive,
  ItemsLive,
  ItemLive,
  ApisLive,
  ReplicaLive,
  PocketLive,
  Wallets,
  Entries,
};

/** A place's dotted name, as the router writes it: `Static.Dynamic`. */
export type Place = typeof router.place.Type;
