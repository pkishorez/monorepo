import { Layer } from 'effect';
import { browser } from '@kestack/auth-toolkit/client/browser';
import { Start } from '@kestack/kabuki/start';
import { HelloHttp } from '../apis/hello-http/index.ts';
import { HelloRpc } from '../apis/hello-rpc/index.ts';
import { router } from '../shared/pages/index.ts';
import Document from './document.tsx';
import { AppView } from './views/index.ts';
import './styles.css';

/*
 * The app as Start draws it, on the server and in the browser: the router,
 * the root page's View, the Document, and the browser's Layer: Accounts
 * from the Auth Worker, and a client per API Worker, each call going with
 * the session cookie. Where the Auth Worker is comes from the site's
 * `VITE_AUTH_URL`, which Alchemy sets and Vite inlines.
 */

const layer = Layer.mergeAll(HelloHttp.layer, HelloRpc.layer).pipe(
  Layer.provideMerge(browser({ url: import.meta.env.VITE_AUTH_URL })),
);

export default Start.app({ router, view: AppView, document: Document, layer });
