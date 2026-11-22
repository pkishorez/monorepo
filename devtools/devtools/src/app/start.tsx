import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Layer } from 'effect';
import { View } from '@kestack/kabuki/react';
import { Router, browser } from '@kestack/kabuki/routing';
import { DevTools } from './actor.js';
import { kabukiLayer } from './kabuki/index.js';
import { lotelLayer } from './lotel/index.js';
import { monoverseLayer } from './monoverse/index.js';
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
    lotelLayer(origin),
    monoverseLayer(origin),
    kabukiLayer(origin),
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
