import { DynamoTable } from '../index.js';
import { table } from './table.js';
import { userSchema, postSchema, commentSchema } from './schemas.js';

// =============================================================================
// User Entity
// PK: User#{userId}, SK: {userId} (idField)
// =============================================================================
export const UserEntity = table
  .entity(userSchema)
  .primary({ pk: ['userId'] })
  .build();

// =============================================================================
// Post Entity
// PK: Post#{authorId}, SK: {postId} (idField)
// GSI1 (byAuthor): PK: byAuthor#{authorId}, SK: {_u}
// =============================================================================
export const PostEntity = table
  .entity(postSchema)
  .primary({ pk: ['authorId'] })
  .index('GSI1', 'byAuthor', { pk: ['authorId'] })
  .build();

// =============================================================================
// Comment Entity
// PK: Comment#{postId}, SK: {commentId} (idField)
// GSI1 (byPost): PK: byPost#{postId}, SK: {_u}
// =============================================================================
export const CommentEntity = table
  .entity(commentSchema)
  .primary({ pk: ['postId'] })
  .index('GSI1', 'byPost', { pk: ['postId'] })
  .build();

// =============================================================================
// Variant derivations of the same schemas live on a separate table object —
// entity names are unique per table.
// =============================================================================
const variantTable = DynamoTable.make()
  .primary('pk', 'sk')
  .gsi('GSI1', 'GSI1PK', 'GSI1SK')
  .build();

// =============================================================================
// Example: Entity with default PK (entity name only)
// PK: User, SK: {userId} (idField)
// =============================================================================
export const UserByIdEntity = variantTable
  .entity(userSchema)
  .primary() // No pk specified - uses entity name only
  .build();

// =============================================================================
// Post Entity with custom SK
// GSI1 (byAuthorName): PK: byAuthorName#{authorId}, SK: {title}
// =============================================================================
export const PostWithCustomSkEntity = variantTable
  .entity(postSchema)
  .primary({ pk: ['authorId'] })
  .index('GSI1', 'byAuthorName', { pk: ['authorId'], sk: ['title'] })
  .build();
