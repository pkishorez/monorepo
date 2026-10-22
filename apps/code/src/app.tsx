import { Effect, Layer } from 'effect';
import { AiClient, retired } from '@kestack/ai-toolkit/client';
import { Start } from '@kestack/kabuki/start';
import { Store } from '@kestack/std-toolkit/replica/idb';
import Document from './document.tsx';
import { DeviceState } from './shell/device-state/index.ts';
import * as Shell from './shell/index.ts';
import './styles.css';

/*
 * The app as Start draws it: the router, the root page's View, the
 * Document, and the browser's Layer: the ai-toolkit server's API over one
 * WebSocket, the Replica's Store in IndexedDB, so a reload shows what it
 * last saw at once and catches up from there, and Device State, what this
 * browser keeps for itself, in IndexedDB too. Replicas of an older
 * projection are deleted as the Store starts.
 */

const url = import.meta.env.VITE_AI_URL ?? 'http://127.0.0.1:4590/rpc';

const layer = Layer.mergeAll(
  AiClient.layer(url),
  Layer.unwrap(Effect.sync(() => Store.idb({ retired }))),
  DeviceState.idb,
);

export default Start.app({
  router: Shell.router,
  view: Shell.View,
  document: Document,
  layer,
});
