import { Page, Router } from '@kestack/kabuki/routing';
import { List, ListLive } from './list.ts';
import { Video, VideoLive } from './video.ts';

/*
 * The root page, with the list at `/` and one Video at `/videos/:id`
 * under it, and the router read down from it. Everything on screen is
 * live, read by the browser from `/api`, so every page is the browser's:
 * the server sends the App Shell.
 */

const App = Page.define({
  pages: { List, Video },
});

export const AppLive = App.build({
  pages: { List: ListLive, Video: VideoLive },
});

export const router = Router.define(App, {
  notFound: { title: 'Not found · ke-video', robots: 'noindex' },
  scrollRestoration: true,
});

export type Route = typeof router.route.Type;
