import type { ReactNode } from 'react';
import { Layer } from 'effect';
import { CloudClient } from '@kestack/connect/code';
import { connect } from '@kestack/devtools-kabuki/session';
import { Start } from '@kestack/kabuki/start';
import { document } from '@kestack/web-platform/app/document';
import { Device } from './device/index.ts';
import { accounts, preferencesIdb } from './device/store.ts';
import { fitted } from './device/account/connections/layout/commands.ts';
import { storageIdb } from './device/account/connections/connection/store/index.ts';
import { Devtools } from './ui/page/devtools/index.ts';
import { Theme } from './ui/page/theme/index.ts';
import './styles.css';

/*
 * The app as Start draws it: the router, the root page's View, the
 * Document, and the browser's Layer, only what the root page itself
 * needs: who is signed in (`Accounts`, which also signs every call to
 * Cloud Connect), Cloud Connect at `VITE_CONNECT_URL`, this device's
 * Preferences, their Bindings kept to what the keys still take, and `Storage`, which deletes the databases of Accounts
 * signed out. Everything below it is Provided by the root page
 * (`device/actor.ts`). No Connection's socket is here: the root page reaches
 * each Connection over its own.
 *
 * Attached beside it while developing, the DevTools Server, as a Kabuki
 * Session: at `/__devtools` on the app's own origin, which Vite pipes to
 * the server its config names, so a tunnel to the app reaches it too.
 */

const layer = Layer.mergeAll(
  CloudClient.layer(import.meta.env.VITE_CONNECT_URL),
  preferencesIdb(fitted),
  storageIdb,
).pipe(Layer.provideMerge(accounts));

export default Start.app({
  router: Device.router,
  view: Device.view,
  name: 'code',
  // The Web Platform's Document: Inter, the Theme and the PWA, and while
  // developing, Kabuki's devtools around every page.
  document: document({
    theme: Theme,
    head: <link rel="icon" type="image/svg+xml" href="/favicon.svg" />,
    ...(import.meta.env.DEV
      ? { around: (app: ReactNode) => <Devtools>{app}</Devtools> }
      : {}),
  }),
  layer,
  attach: import.meta.env.DEV ? [connect()] : [],
});
