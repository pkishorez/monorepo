import { Effect, Layer } from 'effect';
import { retired } from '@kestack/ai-toolkit/client';
import { MachinesClient } from '@kestack/ai-toolkit/machines/client';
import { Start } from '@kestack/kabuki/start';
import { Store } from '@kestack/std-toolkit/replica/idb';
import Document from './document.tsx';
import { DeviceState } from './shell/device-state/index.ts';
import * as Shell from './shell/index.ts';
import { Machines, savedIdb } from './shell/machines/index.ts';
import { accounts } from './shell/sign-in/index.ts';
import './styles.css';

/*
 * The app as Start draws it: the router, the root page's View, the
 * Document, and the browser's Layer: who is signed in (`Accounts`, which
 * also signs every call to the Machines Backend), the Machines Backend at
 * `VITE_MACHINES_URL`, the Replica's Store in IndexedDB, one database per
 * Machine's Instance, so a reload shows what it last saw at once and
 * catches up from there, each Account's last list of Machines and
 * `Machines`, which says it to every page, and Device State, what this
 * browser keeps for itself, in IndexedDB too, and the microphone a
 * Dictation records, with how the app's asks reach it. Replicas no longer
 * read are deleted as the Store starts. No Machine's socket is here: the root page
 * reaches each Machine over its own.
 */

const layer = Layer.mergeAll(
  MachinesClient.layer(import.meta.env.VITE_MACHINES_URL),
  DeviceState.idb,
  savedIdb,
  Machines.layer,
  Shell.Dictations.layer,
  Shell.Recorder.browser,
).pipe(
  Layer.provideMerge(Layer.unwrap(Effect.sync(() => Store.idb({ retired })))),
  Layer.provideMerge(accounts),
);

export default Start.app({
  router: Shell.router,
  view: Shell.View,
  document: Document,
  layer,
});
