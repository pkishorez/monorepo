import { Effect, Schema } from 'effect';
import { Actor } from 'effect-oak';
import { AsyncData } from '../../async-data/index.js';
import { Blog, Post, PostDetail, Served } from '../../blog-server/index.js';

/*
 * The Posts tab, and the cache behind it: the list, and every post's detail
 * by id, as AsyncData in the Model. Browsing shows the list; Reading shows one
 * post. The cache is Model data, so it outlives both States: open a post, go
 * back, open it again, and the second visit is drawn from the Model.
 */

const PostList = Served(Schema.Array(Post));
const PostPage = Served(PostDetail);

const fetchList = Effect.gen(function* () {
  const result = yield* AsyncData.attempt((yield* Blog).posts);
  return { _tag: 'SettledFetchPosts' as const, result };
});

const fetchPost = (postId: string) =>
  Effect.gen(function* () {
    const result = yield* AsyncData.attempt((yield* Blog).post(postId));
    return { _tag: 'SettledFetchPost' as const, postId, result };
  });

const Model = Schema.Struct({
  list: AsyncData.schema(PostList),
  details: Schema.Record(Schema.String, AsyncData.schema(PostPage)),
});
type Model = typeof Model.Type;

/** Refetch the list, keeping it on screen, unless a fetch is running. */
const refetchList = (_: unknown, { model }: { readonly model: Model }) => {
  const list = AsyncData.revalidateOrLoad(model.list);
  return list ? { model: { ...model, list }, command: fetchList } : {};
};

export const Posts = Actor.make('Posts', {
  requires: { blog: Blog },
  model: Model,
  state: Schema.TaggedUnion({
    Browsing: {},
    Reading: { postId: Schema.String },
  }),
  message: Schema.TaggedUnion({
    ClickedPost: { postId: Schema.String },
    ClickedBackToPosts: {},
    ClickedInvalidatePosts: {},
    ClickedRetryPosts: {},
    ClickedRetryPost: { postId: Schema.String },
    SettledFetchPosts: { result: AsyncData.result(PostList) },
    SettledFetchPost: {
      postId: Schema.String,
      result: AsyncData.result(PostPage),
    },
  }),
}).build({
  init: () => ({
    model: { list: AsyncData.loading, details: {} },
    state: { _tag: 'Browsing' },
  }),
  lifetime: {
    '*': (self) => Effect.flatMap(fetchList, self.send),
  },
  update: {
    Browsing: {
      ClickedPost: ({ postId }, { model }) => {
        const state = { _tag: 'Reading' as const, postId };
        const entry = AsyncData.loadIfMissing(
          model.details[postId] ?? AsyncData.idle,
        );
        return entry
          ? {
              state,
              model: {
                ...model,
                details: { ...model.details, [postId]: entry },
              },
              command: fetchPost(postId),
            }
          : { state };
      },
    },
    Reading: {
      ClickedBackToPosts: () => ({ state: { _tag: 'Browsing' } }),
      ClickedRetryPost: ({ postId }, { model }) => ({
        model: {
          ...model,
          details: { ...model.details, [postId]: AsyncData.loading },
        },
        command: fetchPost(postId),
      }),
    },
    '*': {
      ClickedInvalidatePosts: refetchList,
      ClickedRetryPosts: refetchList,
      SettledFetchPosts: ({ result }, { model }) => ({
        model: { ...model, list: AsyncData.settle(model.list, result) },
      }),
      SettledFetchPost: ({ postId, result }, { model }) => ({
        model: {
          ...model,
          details: {
            ...model.details,
            [postId]: AsyncData.settle(
              model.details[postId] ?? AsyncData.loading,
              result,
            ),
          },
        },
      }),
    },
  },
});
