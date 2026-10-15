import { Route } from '@kestack/kabuki/routing';
import { about, Feed as FeedData } from '../data/index.ts';

/*
 * A long feed that scrolls the window: a client page, so the server sends
 * it loading and the browser loads it. Open a post from it and press Back:
 * the window goes back to where it was once the feed's data is there.
 */

export const Feed = Route.page({
  path: '/feed',
  render: 'client',
  data: FeedData,
  metadata: about('/feed', 'Feed', 'A client page that scrolls the window.'),
}).build({});
