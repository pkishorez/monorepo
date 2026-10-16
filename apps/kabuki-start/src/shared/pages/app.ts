import { Clock, Effect, Schema } from 'effect';
import { Page } from '@kestack/kabuki/routing';
import { Blog, BlogLive } from './blog/index.ts';
import { Feed, FeedLive } from './feed.ts';
import { Home, HomeLive } from './home.ts';
import { Preload, PreloadLive } from './preload/index.ts';
import { Search, SearchLive } from './search.ts';
import { Teams, TeamsLive } from './teams/index.ts';

/*
 * The root page: no path and no data, every other page under it. Its one
 * Worker ticks once the Runtime has started, which a page drawn by the
 * server shows only after it hydrates.
 */

export const App = Page.define({
  metadata: { meta: [{ property: 'og:site_name', content: 'Kabuki Start' }] },
  pages: { Home, Blog, Teams, Feed, Search, Preload },
  model: Schema.Struct({ live: Schema.NullOr(Schema.Number) }),
  message: Schema.TaggedUnion({ Ticked: { now: Schema.Number } }),
});

export const AppLive = Page.build(App, {
  pages: {
    Home: HomeLive,
    Blog: BlogLive,
    Teams: TeamsLive,
    Feed: FeedLive,
    Search: SearchLive,
    Preload: PreloadLive,
  },
  init: () => ({ model: { live: null } }),
  workers: {
    tick: {
      run: (self) =>
        Effect.forever(
          Clock.currentTimeMillis.pipe(
            Effect.flatMap((now) => self.send({ _tag: 'Ticked', now })),
            Effect.andThen(Effect.sleep('1 second')),
          ),
        ),
    },
  },
  on: { Ticked: ({ now }) => ({ model: { live: now } }) },
});
