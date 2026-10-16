import { Schema } from 'effect';

/*
 * The data each page's Loader gives, as Schemas both sides read it with.
 * Where it came from and how long it took is the page's `status.info`.
 */

export const PostSummary = Schema.Struct({
  slug: Schema.String,
  title: Schema.String,
  summary: Schema.String,
  date: Schema.String,
});

export const PostList = Schema.Struct({
  posts: Schema.Array(PostSummary),
});

export const Post = Schema.Struct({
  slug: Schema.String,
  title: Schema.String,
  summary: Schema.String,
  date: Schema.String,
  body: Schema.Array(Schema.String),
});

export const Member = Schema.Struct({
  handle: Schema.String,
  name: Schema.String,
  role: Schema.String,
});

export const Team = Schema.Struct({
  slug: Schema.String,
  name: Schema.String,
  members: Schema.Array(Member),
});

export const Profile = Schema.Struct({
  handle: Schema.String,
  name: Schema.String,
  role: Schema.String,
  bio: Schema.String,
  /** What they did lately, newest first: long enough to scroll. */
  activity: Schema.Array(Schema.String),
});

export const Results = Schema.Struct({
  q: Schema.String,
  hits: Schema.Array(PostSummary),
});

export const Slow = Schema.Struct({
  n: Schema.Number,
  /** How many times its Loader has run in this Worker: it counts up only once its copy is stale. */
  loads: Schema.Number,
});

export const FeedItem = Schema.Struct({
  id: Schema.Number,
  slug: Schema.String,
  title: Schema.String,
  summary: Schema.String,
  minutes: Schema.Number,
});

/** A long feed, loaded in the browser alone. */
export const Feed = Schema.Struct({
  items: Schema.Array(FeedItem),
});
