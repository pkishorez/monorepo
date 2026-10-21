import { Effect, Layer } from 'effect';
import { AiClient } from '@kestack/ai-toolkit/client';
import { Start } from '@kestack/kabuki/start';
import { Store } from '@kestack/std-toolkit/replica/memory';
import { router } from '../shared/pages/index.ts';
import Document from './document.tsx';
import { AppView } from './views/index.ts';
import './styles.css';

/*
 * The app as Start draws it: the router, the root page's View, the
 * Document, and the browser's Layer: the ai-toolkit server's API over one
 * WebSocket, and the Replica's Store, in memory. The server runs on this
 * machine, so every reload reads it afresh; nothing is kept on the device.
 */

const url = import.meta.env.VITE_AI_URL ?? 'http://127.0.0.1:4590/rpc';

const layer = Layer.mergeAll(
  AiClient.layer(url),
  Layer.unwrap(Effect.sync(() => Store.memory())),
);

export default Start.app({ router, view: AppView, document: Document, layer });
