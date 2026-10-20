import { Start } from '@kestack/kabuki/start';
import { apiLive } from './api/index.ts';
import Document from './document.tsx';
import { router } from './pages/index.ts';
import { AppView } from './views/index.ts';
import './styles.css';

/** The Auth Worker's pages: drawn by the worker, carried on in the browser. */
export default Start.app({
  router,
  view: AppView,
  document: Document,
  layer: apiLive,
});
