import { Effect, Layer } from 'effect';
import {
  browser,
  browserAccountsTable,
} from '@kestack/auth-toolkit/client/browser';
import { IDB } from '@kestack/std-toolkit/db/idb';
import { Store } from '@kestack/std-toolkit/replica/idb';
import { Start } from '@kestack/kabuki/start';
import { HelloHttp } from '../apis/hello-http/index.ts';
import { HelloRpc } from '../apis/hello-rpc/index.ts';
import { PocketRpc } from '../apis/pocket/index.ts';
import { router } from '../shared/pages/index.ts';
import Document from './document.tsx';
import { AppView } from './views/index.ts';
import './styles.css';

/*
 * The app as Start draws it, on the server and in the browser: the router,
 * the root page's View, the Document, and the browser's Layer: Accounts
 * from the Auth Worker, and a client per API Worker, each call going with
 * the session cookie. Where the Auth Worker is comes from the site's
 * `VITE_AUTH_URL`, which Alchemy sets and Vite inlines. The Accounts last
 * seen are kept in IndexedDB, without tokens, so the header opens on the
 * avatar while the Auth Worker confirms it; the table is opened only once
 * the Layer is built, in the browser. So is the Replica Store, one
 * IndexedDB database per Pocket Instance, shared by the browser's tabs.
 */

const remembered = Layer.unwrap(
  Effect.sync(
    () =>
      IDB.make(browserAccountsTable, {
        database: IDB.database({ databaseName: 'kabuki-start' }),
        mode: 'disposable',
      }).layer,
  ),
);

const replicas = Layer.unwrap(Effect.sync(() => Store.idb()));

const layer = Layer.mergeAll(
  HelloHttp.layer,
  HelloRpc.layer,
  PocketRpc.layer,
  replicas,
).pipe(
  Layer.provideMerge(
    browser({ url: import.meta.env.VITE_AUTH_URL, cache: remembered }),
  ),
);

export default Start.app({ router, view: AppView, document: Document, layer });
