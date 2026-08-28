import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserApp } from './browser-app/index.js';
import './styles.css';

const root = document.getElementById('root');
if (root === null) throw new Error('DevTools root element is missing.');

createRoot(root).render(
  <StrictMode>
    <BrowserApp />
  </StrictMode>,
);
