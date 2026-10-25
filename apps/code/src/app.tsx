import { Layer } from 'effect';
import { CloudClient } from '@kestack/connect/code';
import { Start } from '@kestack/kabuki/start';
import { document } from '@kestack/web-platform/app/document';
import { Shell } from './shell/index.ts';
import { Theme } from './ui/theme/index.ts';
import { router } from './pages.ts';
import {
  accountReplicasIdb,
  deviceStateIdb,
  dictations,
  machines,
  recorder,
  savedMachinesIdb,
} from './layer/services/index.ts';
import { accounts } from './sign-in/index.ts';
import './styles.css';

/*
 * The app as Start draws it: the router, the root page's View, the
 * Document, and the browser's Layer: who is signed in (`Accounts`, which
 * also signs every call to Cloud Connect), Cloud Connect at
 * `VITE_CONNECT_URL`, the Replica's Store in IndexedDB, one per Account
 * with one database per Machine's Instance in it, so a reload shows what
 * it last saw at once and catches up from there, each Account's last list
 * of Machines and `Machines`, which says it to every page, and Device
 * State, what this browser keeps for itself, in IndexedDB too, and the
 * microphone a Dictation records, with how the app's asks reach it. No
 * Machine's socket is here: the root page reaches each Machine over its
 * own.
 */

const layer = Layer.mergeAll(
  CloudClient.layer(import.meta.env.VITE_CONNECT_URL),
  deviceStateIdb,
  savedMachinesIdb,
  machines,
  dictations,
  recorder,
).pipe(Layer.provideMerge(accountReplicasIdb), Layer.provideMerge(accounts));

export default Start.app({
  router,
  view: Shell.view,
  // The Web Platform's Document: Inter, the Theme and the PWA.
  document: document({
    theme: Theme,
    head: <link rel="icon" type="image/svg+xml" href="/favicon.svg" />,
  }),
  layer,
});
