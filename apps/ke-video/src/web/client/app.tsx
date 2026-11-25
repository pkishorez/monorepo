import { Start } from '@kestack/kabuki/start';
import { document } from '@kestack/web-platform/app/document';
import { Api, router } from '../shared/index.ts';
import { AppView, Theme } from './views/index.ts';
import './styles.css';

/*
 * The app as Start draws it: the router, the root page's View in the Web
 * Platform's Document, and the browser's Layer, the door to `/api`. A
 * local tool, so it asks nothing about updates or installing.
 */

export default Start.app({
  router,
  view: AppView,
  name: 'ke-video',
  loading: (
    <main className="flex min-h-dvh items-center justify-center text-sm text-muted-foreground">
      ke-video
    </main>
  ),
  document: document({
    theme: Theme,
    prompts: { update: 'reload', install: 'off' },
  }),
  layer: Api.layer,
});
