import { DynamoEntity } from "../index.js";
import { table } from "./table.js";
import { userSchema, postSchema, commentSchema } from "./schemas.js";

// =============================================================================
// User Entity
// PK: User#{id}, SK: User
// =============================================================================
export const UserEntity = DynamoEntity.make(table)
  .eschema(userSchema)
  .primary({
    pk: ["id"],
    sk: [],
  })
  .build();

// =============================================================================
// Post Entity
// PK: Post#{authorId}, SK: {id}
// GSI1 (byAuthor): PK: byAuthor#{authorId}, SK: {createdAt}#{id}
// =============================================================================
export const PostEntity = DynamoEntity.make(table)
  .eschema(postSchema)
  .primary({
    pk: ["authorId"],
    sk: ["id"],
  })
  .index("GSI1", "byAuthor", {
    pk: ["authorId"],
    sk: ["createdAt", "id"],
  })
  .build();

// =============================================================================
// Comment Entity
// PK: Comment#{postId}, SK: {id}
// GSI1 (byPost): PK: byPost#{postId}, SK: {createdAt}#{id}
// =============================================================================
export const CommentEntity = DynamoEntity.make(table)
  .eschema(commentSchema)
  .primary({
    pk: ["postId"],
    sk: ["id"],
  })
  .index("GSI1", "byPost", {
    pk: ["postId"],
    sk: ["createdAt", "id"],
  })
  .build();

// =============================================================================
// Example: Entity with _u in sort key for time-ordered results (ULID)
// GSI1 (byAuthorTime): PK: byAuthorTime#{authorId}, SK: {_u}
// =============================================================================
export const PostByTimeEntity = DynamoEntity.make(table)
  .eschema(postSchema)
  .primary({
    pk: ["authorId"],
    sk: ["id"],
  })
  .index("GSI1", "byAuthorTime", {
    pk: ["authorId"],
    sk: ["_u"], // Orders sorted by creation time (ULID)
  })
  .build();
