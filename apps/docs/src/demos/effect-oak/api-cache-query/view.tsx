import { View } from 'effect-oak/react';
import { Button } from '@kstackz/web-platform/components/button';
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from '@kstackz/web-platform/components/tabs';
import { ApiCacheQuery } from './api-cache-query.js';
import { PostDetailView, PostListView } from './posts-view.js';
import { StatsView } from './stats-view.js';

export const ApiCacheQueryView = View.make(
  ApiCacheQuery,
  ({ model, children, send }) => (
    <div className="size-full overflow-y-auto p-6">
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">API cache, with Queries</h1>
          <p className="text-muted-foreground">
            Each fetch is a Query Actor that keeps its own data. The app decides
            when each one loads or refreshes.
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
        {model.tab === 'Stats' ? (
          <StatsView node={children.stats} />
        ) : model.openPostId === null ? (
          <PostListView node={children.posts} />
        ) : (
          <section className="flex flex-col gap-4">
            <Button
              size="sm"
              variant="link"
              className="self-start px-0"
              onClick={() => send({ _tag: 'ClickedBackToPosts' })}
            >
              ← Back to posts
            </Button>
            <PostDetailView node={children.post} />
          </section>
        )}
      </div>
    </div>
  ),
);
