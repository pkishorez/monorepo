import { createRoot } from 'react-dom/client';
import { SnapshotApp } from './browser-app/index.js';
import './styles.css';

const root = document.getElementById('root');
if (root === null)
  throw new Error('DevTools snapshot root element is missing.');

createRoot(root).render(<SnapshotApp />);
