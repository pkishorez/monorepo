import { Layer } from 'effect';
import { BrowserRuntime } from '@effect/platform-browser';
import { speechWorkerLayer } from './engine/speech-worker/index.ts';

BrowserRuntime.runMain(Layer.launch(speechWorkerLayer));
