import { Context, Schema } from 'effect';
import { Node } from 'effect-oak';
import { Blog } from '../blog-server/index.js';
import { Posts } from './posts/index.js';
import { Stats, Tabs } from './stats/index.js';

/*
 * A query cache written as plain Nodes: two tabs, each a Child that keeps its
 * own fetched data as AsyncData in its Model.
 *
 * The tab is the app's Model, not its State: Children belong to a State, so
 * tabs as States would throw each tab's cache away on leaving it. Both
 * Children live as long as the app; the View draws the one shown. Stats asks
 * the Tabs Service whether it is shown before it fetches again.
 */

const Tab = Schema.Literals(['Posts', 'Stats']);

export const ApiCache = Node.make('ApiCache', {
  requires: { blog: Blog },
  model: Schema.Struct({ tab: Tab }),
  message: Schema.TaggedUnion({ SelectedTab: { tab: Tab } }),
  provides: [Tabs],
  children: { posts: Posts, stats: Stats },
}).build({
  init: () => ({ model: { tab: 'Posts' } }),
  provides: ({ model }) => Context.make(Tabs, { shown: model.tab }),
  update: {
    SelectedTab: ({ tab }) => ({ model: { tab } }),
  },
});

export { BlogLive } from '../blog-server/index.js';
