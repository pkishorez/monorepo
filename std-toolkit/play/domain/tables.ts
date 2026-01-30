import { SQLiteTable, SQLiteEntity, EntityRegistry } from "@std-toolkit/sqlite";
import { UserSchema, PostSchema, CommentSchema, LikeSchema } from "./schemas";

export const AppTable = SQLiteTable.make({ tableName: "app_data" })
  .primary("pk", "sk")
  .index("timeline", "tlpk", "tlsk")
  .index("gsi1", "gsi1pk", "gsi1sk")
  .index("gsi2", "gsi2pk", "gsi2sk")
  .build();

export const UserEntity = SQLiteEntity.make(AppTable)
  .eschema(UserSchema)
  .primary()
  .timeline("timeline")
  .build();

export const PostEntity = SQLiteEntity.make(AppTable)
  .eschema(PostSchema)
  .primary()
  .timeline("timeline")
  .index("gsi1", "byUser", { pk: ["userId"] })
  .build();

export const CommentEntity = SQLiteEntity.make(AppTable)
  .eschema(CommentSchema)
  .primary()
  .timeline("timeline")
  .index("gsi1", "byPost", { pk: ["postId"] })
  .index("gsi2", "byUser", { pk: ["userId"] })
  .build();

export const LikeEntity = SQLiteEntity.make(AppTable)
  .eschema(LikeSchema)
  .primary()
  .timeline("timeline")
  .index("gsi1", "byPost", { pk: ["postId"] })
  .index("gsi2", "byUser", { pk: ["userId"] })
  .build();

export const registry = EntityRegistry.make(AppTable)
  .register(UserEntity)
  .register(PostEntity)
  .register(CommentEntity)
  .register(LikeEntity)
  .build();
