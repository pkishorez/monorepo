import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Layer } from 'effect';
import { View } from '@kestack/kabuki/react';
import { Router, browser } from '@kestack/kabuki/routing';
import { DevTools } from './actor.js';
import { agentLayer } from './services/agent/real/index.js';
import { sessionsLayer } from './kabuki/services/sessions/real/index.js';
import { preferencesLayer } from './services/preferences/real/index.js';
import { projectRegistryLayer } from './services/project-registry/real/index.js';
import { telemetryLayer } from './lotel/services/telemetry/real/index.js';
import { toastsLayer } from './lotel/services/toasts/real/index.js';
import { projectsLayer } from './monoverse/services/projects/real/index.js';
import { applyTheme, readTheme, DevToolsView } from './view.js';
import './styles.css';

const router = Router.define(DevTools);
const Routed = Router.view(router, DevToolsView);
const origin = location.origin;

const DevToolsApp = View.app(Routed, {
  layer: Layer.mergeAll(
    telemetryLayer(origin),
    preferencesLayer,
    toastsLayer,
    projectsLayer(origin),
    sessionsLayer(origin),
    agentLayer(origin),
    projectRegistryLayer(origin),
    browser(),
  ),
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
