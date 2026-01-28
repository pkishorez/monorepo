import { Schema } from "effect";
import { ESchema } from "@std-toolkit/eschema";

// =============================================================================
// User Schema - v1 -> v2 (added bio) -> v3 (added followerCount)
// =============================================================================
export const userSchema = ESchema.make("User", "userId", {
  username: Schema.String,
  email: Schema.String,
  createdAt: Schema.String,
})
  .evolve(
    "v2",
    {
      username: Schema.String,
      email: Schema.String,
      createdAt: Schema.String,
      bio: Schema.String,
    },
    (prev) => ({
      ...prev,
      bio: "",
    }),
  )
  .evolve(
    "v3",
    {
      username: Schema.String,
      email: Schema.String,
      createdAt: Schema.String,
      bio: Schema.String,
      followerCount: Schema.Number,
    },
    (prev) => ({
      ...prev,
      followerCount: 0,
    }),
  )
  .build();

// =============================================================================
// Post Schema - v1 -> v2 (added tags) -> v3 (added likeCount, viewCount)
// =============================================================================
export const postSchema = ESchema.make("Post", "postId", {
  authorId: Schema.String,
  title: Schema.String,
  content: Schema.String,
  createdAt: Schema.String,
})
  .evolve(
    "v2",
    {
      authorId: Schema.String,
      title: Schema.String,
      content: Schema.String,
      createdAt: Schema.String,
      tags: Schema.Array(Schema.String),
    },
    (prev) => ({
      ...prev,
      tags: [],
    }),
  )
  .evolve(
    "v3",
    {
      authorId: Schema.String,
      title: Schema.String,
      content: Schema.String,
      createdAt: Schema.String,
      tags: Schema.Array(Schema.String),
      likeCount: Schema.Number,
      viewCount: Schema.Number,
    },
    (prev) => ({
      ...prev,
      likeCount: 0,
      viewCount: 0,
    }),
  )
  .build();

// =============================================================================
// Comment Schema - v1 -> v2 (added editedAt)
// =============================================================================
export const commentSchema = ESchema.make("Comment", "commentId", {
  postId: Schema.String,
  authorId: Schema.String,
  content: Schema.String,
  createdAt: Schema.String,
})
  .evolve(
    "v2",
    {
      postId: Schema.String,
      authorId: Schema.String,
      content: Schema.String,
      createdAt: Schema.String,
      editedAt: Schema.NullOr(Schema.String),
    },
    (prev) => ({
      ...prev,
      editedAt: null,
    }),
  )
  .build();
