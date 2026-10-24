import { Start } from '@kestack/kabuki/start';
import { router } from '../shared/pages/index.ts';
import Document from './document.tsx';
import { TrackerLive } from './tracker/index.ts';
import { AppView } from './views/index.ts';
import './styles.css';

/*
 * The app as Start draws it, on the server and in the browser: the router,
 * the root page's View, the Document, and the browser's Layer, which is
 * the Tracker: the camera and the model the Playground Requires.
 */

export default Start.app({
  router,
  view: AppView,
  document: Document,
  layer: TrackerLive,
});
