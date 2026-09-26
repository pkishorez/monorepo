import { Layer } from 'effect';
import { BrowserRuntime } from '@effect/platform-browser';
import { synthesisWorkerLayer } from './engine/synthesis-worker/index.ts';

BrowserRuntime.runMain(Layer.launch(synthesisWorkerLayer));
