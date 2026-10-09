import { View } from 'effect-oak/react';
import { Button } from '@kstackz/web-platform/components/button';
import { AsyncData, ErrorPanel, LoadingPanel } from '../async-data/index.js';
import { PostQuery, PostsQuery } from './queries.js';

/** The Posts Query drawn as the list; a click is reported as a choice. */
export const PostListView = View.make(PostsQuery, ({ model, send }) => {
  const entry = model.entries[''] ?? AsyncData.idle;
  const list = AsyncData.dataOf(entry);
  const error = AsyncData.errorOf(entry);
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Posts</h2>
        <Button
          size="sm"
          variant="outline"
          disabled={AsyncData.isPending(entry)}
          onClick={() => send({ _tag: 'ClickedRefresh', key: '' })}
        >
          {entry._tag === 'Refreshing' ? 'Refreshing…' : 'Refresh'}
        </Button>
      </div>
      {error !== undefined && (
        <ErrorPanel
          error={error}
          onRetry={() => send({ _tag: 'ClickedRetry', key: '' })}
        />
      )}
      {list === undefined ? (
        error === undefined && <LoadingPanel text="Loading posts…" />
      ) : (
        <ul className="flex flex-col gap-2">
          {list.data.map((post) => (
            <li key={post.id}>
              <button
                type="button"
                className="w-full rounded-lg border px-4 py-3 text-left hover:bg-muted"
                onClick={() => send({ _tag: 'Chose', value: post.id })}
              >
                <span className="block font-medium">{post.title}</span>
                <span className="block text-sm text-muted-foreground">
                  {post.excerpt}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
});

/** The Post Query drawn as the post it was last ordered to load. */
export const PostDetailView = View.make(PostQuery, ({ model, send }) => {
  const key = model.focus;
  const entry = model.entries[key] ?? AsyncData.idle;
  const page = AsyncData.dataOf(entry);
  const error = AsyncData.errorOf(entry);
  return (
    <>
      {error !== undefined && (
        <ErrorPanel
          error={error}
          onRetry={() => send({ _tag: 'ClickedRetry', key })}
        />
      )}
      {page === undefined ? (
        error === undefined && <LoadingPanel text="Loading post…" />
      ) : (
        <article className="flex flex-col gap-3 rounded-xl border p-6">
          <h2 className="text-2xl font-semibold">{page.data.title}</h2>
          <p className="text-sm text-muted-foreground">By {page.data.author}</p>
          <p className="leading-relaxed">{page.data.body}</p>
          <p className="text-xs text-muted-foreground">
            Fetched at {new Date(page.servedAt).toLocaleTimeString()}. Later
            visits are drawn from the Query's Model.
          </p>
        </article>
      )}
    </>
  );
});
