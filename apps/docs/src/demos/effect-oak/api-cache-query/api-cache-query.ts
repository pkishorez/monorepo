import { Context, Layer, Schema, Stream } from 'effect';
import { Node } from 'effect-oak';
import { Blog, BlogLive } from '../blog-server/index.js';
import { PostQuery, PostsQuery, Reader, StatsQuery } from './queries.js';
import { Orders, OrdersLive, tell } from './query/index.js';

/*
 * The API cache again, with each fetch as a Query Node that keeps its own
 * data. The app decides when each Query loads, as Foldkit's parent does:
 * posts at start, stats when their tab is first opened and every 5 seconds
 * while it is shown, a post's detail when it is opened. It tells them through
 * Orders, since a parent cannot send its Children Messages.
 */

const STATS_EVERY_MS = 5000;
const Tab = Schema.Literals(['Posts', 'Stats']);

export const ApiCacheQuery = Node.make('ApiCacheQuery', {
  requires: { blog: Blog, orders: Orders },
  model: Schema.Struct({ tab: Tab, openPostId: Schema.NullOr(Schema.String) }),
  message: Schema.TaggedUnion({
    SelectedTab: { tab: Tab },
    OpenedPost: { postId: Schema.String },
    ClickedBackToPosts: {},
    TickedStatsRefreshInterval: {},
  }),
  provides: [Reader],
  children: { posts: PostsQuery, post: PostQuery, stats: StatsQuery },
}).build({
  init: () => ({
    model: { tab: 'Posts', openPostId: null },
    commands: [tell('Posts', { _tag: 'LoadIfMissing', key: '' })],
  }),
  provides: ({ send }) =>
    Context.make(Reader, {
      open: (postId) => send({ _tag: 'OpenedPost', postId }),
    }),
  lifetime: () =>
    Stream.tick(STATS_EVERY_MS).pipe(
      Stream.drop(1),
      Stream.map(() => ({ _tag: 'TickedStatsRefreshInterval' as const })),
    ),
  update: {
    SelectedTab: ({ tab }, { model }) => ({
      model: { ...model, tab },
      commands:
        tab === 'Stats'
          ? [tell('Stats', { _tag: 'LoadIfMissing', key: '' })]
          : [],
    }),
    OpenedPost: ({ postId }, { model }) => ({
      model: { ...model, openPostId: postId },
      commands: [tell('Post', { _tag: 'LoadIfMissing', key: postId })],
    }),
    ClickedBackToPosts: (_, { model }) => ({
      model: { ...model, openPostId: null },
    }),
    // The Lifetime cannot stop while the tab is hidden: it ticks anyway.
    TickedStatsRefreshInterval: (_, { model }) =>
      model.tab === 'Stats'
        ? { commands: [tell('Stats', { _tag: 'Revalidate', key: '' })] }
        : {},
  },
});

/** The fake blog, and the mailboxes the app tells its Queries through. */
export const ApiCacheQueryLive = Layer.mergeAll(BlogLive, OrdersLive);
