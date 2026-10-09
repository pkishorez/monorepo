import { View } from 'effect-oak/react';
import { Badge } from '@kstackz/web-platform/components/badge';
import { Button } from '@kstackz/web-platform/components/button';
import { AsyncData, ErrorPanel, LoadingPanel } from '../../async-data/index.js';
import { Posts } from './posts.js';

const time = (servedAt: number) => new Date(servedAt).toLocaleTimeString();

export const PostsView = View.make(Posts, {
  Browsing: ({ model, send }) => {
    const list = AsyncData.dataOf(model.list);
    const error = AsyncData.errorOf(model.list);
    const retry = () => send({ _tag: 'ClickedRetryPosts' });
    return (
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Posts</h2>
          <Button
            size="sm"
            variant="outline"
            disabled={AsyncData.isPending(model.list)}
            onClick={() => send({ _tag: 'ClickedInvalidatePosts' })}
          >
            {model.list._tag === 'Refreshing' ? 'Refreshing…' : 'Invalidate'}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Open a post, go back, and open it again: the second visit is drawn
          from the Model. Invalidate fetches the list again while the current
          one stays on screen.
        </p>
        {error !== undefined && <ErrorPanel error={error} onRetry={retry} />}
        {list === undefined ? (
          error === undefined && <LoadingPanel text="Loading posts…" />
        ) : (
          <ul className="flex flex-col gap-2">
            {list.data.map((post) => (
              <li key={post.id}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-4 rounded-lg border px-4 py-3 text-left hover:bg-muted"
                  onClick={() => send({ _tag: 'ClickedPost', postId: post.id })}
                >
                  <span>
                    <span className="block font-medium">{post.title}</span>
                    <span className="block text-sm text-muted-foreground">
                      {post.excerpt}
                    </span>
                  </span>
                  {AsyncData.dataOf(
                    model.details[post.id] ?? AsyncData.idle,
                  ) !== undefined && <Badge variant="secondary">Cached</Badge>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  },
  Reading: ({ model, state, send }) => {
    const entry = model.details[state.postId] ?? AsyncData.idle;
    const page = AsyncData.dataOf(entry);
    const error = AsyncData.errorOf(entry);
    return (
      <section className="flex flex-col gap-4">
        <Button
          size="sm"
          variant="link"
          className="self-start px-0"
          onClick={() => send({ _tag: 'ClickedBackToPosts' })}
        >
          ← Back to posts
        </Button>
        {error !== undefined && (
          <ErrorPanel
            error={error}
            onRetry={() =>
              send({ _tag: 'ClickedRetryPost', postId: state.postId })
            }
          />
        )}
        {page === undefined ? (
          error === undefined && <LoadingPanel text="Loading post…" />
        ) : (
          <article className="flex flex-col gap-3 rounded-xl border p-6">
            <h2 className="text-2xl font-semibold">{page.data.title}</h2>
            <p className="text-sm text-muted-foreground">
              By {page.data.author}
            </p>
            <p className="leading-relaxed">{page.data.body}</p>
            <p className="text-xs text-muted-foreground">
              Fetched at {time(page.servedAt)}. Later visits are drawn from the
              Model.
            </p>
          </article>
        )}
      </section>
    );
  },
});
