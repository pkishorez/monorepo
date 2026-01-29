import { DynamoEntity } from "../index.js";
import { table } from "./table.js";
import { userSchema, postSchema, commentSchema } from "./schemas.js";

// =============================================================================
// User Entity
// PK: User#{userId}, SK: {userId} (idField)
// =============================================================================
export const UserEntity = DynamoEntity.make(table)
  .eschema(userSchema)
  .primary({ pk: ["userId"] })
  .build();

// =============================================================================
// Post Entity
// PK: Post#{authorId}, SK: {postId} (idField)
// GSI1 (byAuthor): PK: byAuthor#{authorId}, SK: {_uid}
// =============================================================================
export const PostEntity = DynamoEntity.make(table)
  .eschema(postSchema)
  .primary({ pk: ["authorId"] })
  .timeline("GSI2")
  .index("GSI1", "byAuthor", { pk: ["authorId"] })
  .build();

// =============================================================================
// Comment Entity
// PK: Comment#{postId}, SK: {commentId} (idField)
// GSI1 (byPost): PK: byPost#{postId}, SK: {_uid}
// =============================================================================
export const CommentEntity = DynamoEntity.make(table)
  .eschema(commentSchema)
  .primary({ pk: ["postId"] })
  .index("GSI1", "byPost", { pk: ["postId"] })
  .build();

// =============================================================================
// Example: Entity with default PK (entity name only)
// PK: User, SK: {userId} (idField)
// =============================================================================
export const UserByIdEntity = DynamoEntity.make(table)
  .eschema(userSchema)
  .primary() // No pk specified - uses entity name only
  .build();
