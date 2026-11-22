import { Layer } from 'effect';
import { preferencesLayer } from './preferences/index.js';
import { telemetryLayer } from './telemetry/index.js';

/**
 * Every Capability the Lotel Tool's tree Requires: the telemetry of the
 * DevTools Server at `origin`, and what it remembers in this browser.
 */
export const lotelLayer = (origin: string) =>
  Layer.mergeAll(telemetryLayer(origin), preferencesLayer);
