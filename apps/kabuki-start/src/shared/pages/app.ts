import { Clock, Effect, Schema } from 'effect';
import { Route } from '@kestack/kabuki/routing';
import { Blog } from './blog/index.ts';
import { Feed } from './feed.ts';
import { Flaky } from './flaky.ts';
import { Home } from './home.ts';
import { Notes } from './notes.ts';
import { Preload } from './preload/index.ts';
import { Search } from './search.ts';
import { Teams } from './teams/index.ts';

/*
 * The root page: no path and no data, every other page under it. Its one
 * Worker ticks once the Runtime has started, which a page drawn by the
 * server shows only after it hydrates.
 */

export const App = Route.page({
  pages: { Home, Blog, Teams, Feed, Search, Notes, Preload, Flaky },
  model: Schema.Struct({ live: Schema.NullOr(Schema.Number) }),
  message: Schema.TaggedUnion({ Ticked: { now: Schema.Number } }),
}).build({
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
