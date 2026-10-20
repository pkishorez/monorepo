import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { THEME_SCRIPT } from '@kestack/web-platform/theme';
import { BrowserApp } from './browser-app/index.js';
import './styles.css';

// Before the first render: the saved Theme, else the system's.
new Function(THEME_SCRIPT)();

const root = document.getElementById('root');
if (root === null) throw new Error('DevTools root element is missing.');

createRoot(root).render(
  <StrictMode>
    <BrowserApp />
  </StrictMode>,
);
