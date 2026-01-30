import { Effect } from "effect";
import { makeEntityRpcHandlers } from "@std-toolkit/sqlite/rpc";
import { SqliteCommand, type SqliteDBError } from "@std-toolkit/sqlite";
import { StdToolkitError } from "@std-toolkit/core/rpc";
import {
  AppRpcs,
  UserEntity,
  UserSchema,
  PostEntity,
  PostSchema,
  CommentEntity,
  CommentSchema,
  LikeEntity,
  LikeSchema,
  registry,
} from "../domain";

const mapError = (e: SqliteDBError) =>
  new StdToolkitError({ message: e.error._tag, code: "DB_ERROR" });

export const HandlersLive = AppRpcs.toLayer({
  ...makeEntityRpcHandlers(UserEntity, UserSchema),
  ...makeEntityRpcHandlers(PostEntity, PostSchema),
  ...makeEntityRpcHandlers(CommentEntity, CommentSchema),
  ...makeEntityRpcHandlers(LikeEntity, LikeSchema),
  ...SqliteCommand.make(registry).toRpcHandler(),

  subscribeUser: ({ uid }) =>
    UserEntity.subscribe({ key: "timeline", pk: {}, cursor: uid }).pipe(
      Effect.mapError(mapError),
    ),

  subscribePost: ({ uid }) =>
    PostEntity.subscribe({ key: "timeline", pk: {}, cursor: uid }).pipe(
      Effect.mapError(mapError),
    ),

  subscribeComment: ({ uid }) =>
    CommentEntity.subscribe({ key: "timeline", pk: {}, cursor: uid }).pipe(
      Effect.mapError(mapError),
    ),

  subscribeLike: ({ uid }) =>
    LikeEntity.subscribe({ key: "timeline", pk: {}, cursor: uid }).pipe(
      Effect.mapError(mapError),
    ),
});
