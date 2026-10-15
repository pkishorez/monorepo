import { Schema } from 'effect';

/*
 * The data each page's Loader gives, as Schemas both sides read it with.
 * Every Loader stamps when it started and when it answered, so a page can
 * show where its data came from, and that two Loaders ran side by side.
 */

/** When a Loader started and answered, in milliseconds since the epoch. */
const timed = { startedAt: Schema.Number, loadedAt: Schema.Number };

export const Timed = Schema.Struct(timed);

export const PostSummary = Schema.Struct({
  slug: Schema.String,
  title: Schema.String,
  summary: Schema.String,
  date: Schema.String,
});

export const PostList = Schema.Struct({
  ...timed,
  posts: Schema.Array(PostSummary),
});

export const Post = Schema.Struct({
  ...timed,
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
  ...timed,
  slug: Schema.String,
  name: Schema.String,
  members: Schema.Array(Member),
});

export const Profile = Schema.Struct({
  ...timed,
  handle: Schema.String,
  name: Schema.String,
  role: Schema.String,
  bio: Schema.String,
  /** What they did lately, newest first: long enough to scroll. */
  activity: Schema.Array(Schema.String),
});

export const Results = Schema.Struct({
  ...timed,
  q: Schema.String,
  hits: Schema.Array(PostSummary),
});

export const Notes = Schema.Struct({
  ...timed,
  text: Schema.String,
  /** How many times this Loader has run in this Worker: a reload shows it go up. */
  version: Schema.Number,
});

export const Slow = Schema.Struct({ ...timed, n: Schema.Number });

export const FeedItem = Schema.Struct({
  id: Schema.Number,
  slug: Schema.String,
  title: Schema.String,
  summary: Schema.String,
  minutes: Schema.Number,
});

/** A long feed, loaded in the browser alone. */
export const Feed = Schema.Struct({
  ...timed,
  items: Schema.Array(FeedItem),
});

export const Luck = Schema.Struct({ ...timed, luck: Schema.Number });
