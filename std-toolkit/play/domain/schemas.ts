import { ESchema } from "@std-toolkit/eschema";
import { Schema } from "effect";

export const UserSchema = ESchema.make("User", "userId", {
  name: Schema.String,
  email: Schema.String,
  bio: Schema.String.pipe(Schema.optional),
  avatarUrl: Schema.String.pipe(Schema.optional),
  status: Schema.Literal("active", "inactive", "suspended"),
  createdAt: Schema.Number,
}).build();

export type User = typeof UserSchema.Type;

export const PostSchema = ESchema.make("Post", "postId", {
  userId: Schema.String,
  title: Schema.String,
  content: Schema.String,
  status: Schema.Literal("draft", "published", "archived"),
  createdAt: Schema.Number,
  updatedAt: Schema.Number.pipe(Schema.optional),
}).build();

export type Post = typeof PostSchema.Type;

export const CommentSchema = ESchema.make("Comment", "commentId", {
  postId: Schema.String,
  userId: Schema.String,
  content: Schema.String,
  createdAt: Schema.Number,
}).build();

export type Comment = typeof CommentSchema.Type;

export const LikeSchema = ESchema.make("Like", "likeId", {
  postId: Schema.String,
  userId: Schema.String,
  createdAt: Schema.Number,
}).build();

export type Like = typeof LikeSchema.Type;
