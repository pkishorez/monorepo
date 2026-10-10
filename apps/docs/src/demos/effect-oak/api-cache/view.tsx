import { View } from 'effect-oak/react';
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from '@kstackz/web-platform/components/tabs';
import { ApiCache } from './api-cache.js';
import { PostsView } from './posts/index.js';
import { StatsView } from './stats/index.js';

export const ApiCacheView = View.make(ApiCache, ({ model, children, send }) => (
  <div className="size-full overflow-y-auto p-6">
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">API cache</h1>
        <p className="text-muted-foreground">
          Query client patterns written as Model data, Update and one Lifetime.
        </p>
      </header>
      <Tabs
        value={model.tab}
        onValueChange={(tab) =>
          (tab === 'Posts' || tab === 'Stats') &&
          send({ _tag: 'SelectedTab', tab })
        }
      >
        <TabsList aria-label="API cache sections">
          <TabsTrigger value="Posts">Posts</TabsTrigger>
          <TabsTrigger value="Stats">Stats</TabsTrigger>
        </TabsList>
      </Tabs>
      {model.tab === 'Posts' ? (
        <PostsView node={children.posts} />
      ) : (
        <StatsView node={children.stats} />
      )}
    </div>
  </div>
));
