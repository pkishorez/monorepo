import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Layer } from 'effect';
import { View } from '@kestack/kabuki/react';
import { Router, browser } from '@kestack/kabuki/routing';
import { DevTools } from './actor.js';
import { sessionsLayer } from './kabuki/services/sessions/real/index.js';
import { preferencesLayer } from './lotel/services/preferences/real/index.js';
import { telemetryLayer } from './lotel/services/telemetry/real/index.js';
import { toastsLayer } from './lotel/services/toasts/real/index.js';
import { monorepoLayer } from './monoverse/services/monorepo/real/index.js';
import { monoverseClientLayer } from './monoverse/services/monoverse-client/real/index.js';
import { applyTheme, readTheme, DevToolsView } from './view.js';
import './styles.css';

/*
 * DevTools in the browser: one Kabuki app, drawn in the page the DevTools
 * Server serves. It owns the URL, and each Tool talks to the DevTools
 * Server the page came from.
 */

const router = Router.define(DevTools);
const Routed = Router.view(router, DevToolsView);
const origin = location.origin;

const DevToolsApp = View.app(Routed, {
  layer: Layer.mergeAll(
    telemetryLayer(origin),
    preferencesLayer,
    toastsLayer,
    monorepoLayer.pipe(Layer.provideMerge(monoverseClientLayer(origin))),
    sessionsLayer(origin),
    browser(),
  ),
  // Drawn at the page the URL names from the first frame.
  input: () => Routed.startAt(),
  name: '@kestack/devtools',
});

const root = document.getElementById('root');
if (root === null) throw new Error('DevTools root element is missing.');

applyTheme(readTheme());
createRoot(root).render(
  <StrictMode>
    <DevToolsApp />
  </StrictMode>,
);
