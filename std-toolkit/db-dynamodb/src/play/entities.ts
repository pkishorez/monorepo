import { DynamoEntity } from "../index.js";
import { table } from "./table.js";
import { userSchema, postSchema, commentSchema } from "./schemas.js";

// =============================================================================
// User Entity
// PK: USER#{id}, SK: PROFILE
// =============================================================================
export const UserEntity = DynamoEntity.make(table)
  .eschema(userSchema)
  .primary({
    pk: { deps: ["id"], derive: (v) => [`USER#${v.id}`] },
    sk: { deps: [], derive: () => ["PROFILE"] },
  })
  .build();

// =============================================================================
// Post Entity
// PK: AUTHOR#{authorId}, SK: POST#{id}
// GSI byAuthor: PK: AUTHOR#{authorId}, SK: {createdAt}#{id}
// =============================================================================
export const PostEntity = DynamoEntity.make(table)
  .eschema(postSchema)
  .primary({
    pk: { deps: ["authorId"], derive: (v) => [`AUTHOR#${v.authorId}`] },
    sk: { deps: ["id"], derive: (v) => [`POST#${v.id}`] },
  })
  .index("byAuthor", {
    pk: { deps: ["authorId"], derive: (v) => [`AUTHOR#${v.authorId}`] },
    sk: { deps: ["createdAt", "id"], derive: (v) => [v.createdAt, v.id] },
  })
  .build();

// =============================================================================
// Comment Entity
// PK: POSTCOMMENTS#{postId}, SK: COMMENT#{id}
// GSI byPost: PK: POSTCOMMENTS#{postId}, SK: {createdAt}#{id}
// =============================================================================
export const CommentEntity = DynamoEntity.make(table)
  .eschema(commentSchema)
  .primary({
    pk: { deps: ["postId"], derive: (v) => [`POSTCOMMENTS#${v.postId}`] },
    sk: { deps: ["id"], derive: (v) => [`COMMENT#${v.id}`] },
  })
  .index("byPost", {
    pk: { deps: ["postId"], derive: (v) => [`POSTCOMMENTS#${v.postId}`] },
    sk: { deps: ["createdAt", "id"], derive: (v) => [v.createdAt, v.id] },
  })
  .build();
