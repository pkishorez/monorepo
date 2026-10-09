import { Context, Effect, Schema, Stream } from 'effect';
import { Node } from 'effect-oak';
import { AsyncData } from '../../async-data/index.js';
import { Blog, Served, Stats as StatsData } from '../../blog-server/index.js';

/*
 * The Stats tab: live numbers, fetched again every 5 seconds while the tab is
 * shown. The old numbers stay on screen while new ones load.
 *
 * Which tab is shown is the parent's data, and a parent cannot tell a Child
 * anything. So Stats asks: its Lifetime ticks every 5 seconds, and each tick
 * is a Command that reads the Tabs Service its parent Provides. A Command
 * sees the Service as it is now; the Lifetime would see it as it was when
 * the Lifetime started.
 */

const REFETCH_EVERY_MS = 5000;

/** Which tab the app shows: Provided by the app, read by Stats' Commands. */
export class Tabs extends Context.Service<
  Tabs,
  { readonly shown: 'Posts' | 'Stats' }
>()('docs/api-cache/Tabs') {}

const ServedStats = Served(StatsData);

const fetchStats = Effect.gen(function* () {
  const result = yield* AsyncData.attempt((yield* Blog).stats);
  return { _tag: 'SettledFetchStats' as const, result };
});

const whenShown = Effect.gen(function* () {
  if ((yield* Tabs).shown === 'Stats')
    return { _tag: 'SawStatsShown' as const };
});

const Model = Schema.Struct({ stats: AsyncData.schema(ServedStats) });
type Model = typeof Model.Type;

const refetch = (_: unknown, { model }: { readonly model: Model }) => {
  const stats = AsyncData.revalidateOrLoad(model.stats);
  return stats ? { model: { stats }, commands: [fetchStats] } : {};
};

export const Stats = Node.make('Stats', {
  requires: { blog: Blog, tabs: Tabs },
  model: Model,
  message: Schema.TaggedUnion({
    TickedRevalidateStats: {},
    SawStatsShown: {},
    ClickedRefreshStats: {},
    ClickedRetryStats: {},
    SettledFetchStats: { result: AsyncData.result(ServedStats) },
  }),
}).build({
  init: () => ({ model: { stats: AsyncData.loading }, commands: [fetchStats] }),
  lifetime: () =>
    Stream.tick(REFETCH_EVERY_MS).pipe(
      Stream.drop(1),
      Stream.map(() => ({ _tag: 'TickedRevalidateStats' as const })),
    ),
  update: {
    TickedRevalidateStats: (_, { model }) =>
      AsyncData.revalidate(model.stats) ? { commands: [whenShown] } : {},
    SawStatsShown: (_, { model }) => {
      const stats = AsyncData.revalidate(model.stats);
      return stats ? { model: { stats }, commands: [fetchStats] } : {};
    },
    ClickedRefreshStats: refetch,
    ClickedRetryStats: refetch,
    SettledFetchStats: ({ result }, { model }) => ({
      model: { stats: AsyncData.settle(model.stats, result) },
    }),
  },
});
