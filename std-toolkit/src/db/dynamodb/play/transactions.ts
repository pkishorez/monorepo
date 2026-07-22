import { Effect } from 'effect';
import { table } from './table.js';
import { UserEntity, PostEntity } from './entities.js';

// =============================================================================
// Transactions
// =============================================================================
export const exampleTransaction = Effect.gen(function* () {
  // Create transaction items from this table's entities
  // Note: userId and postId are optional - auto-generated if not provided
  const userOp = yield* UserEntity.insertOp({
    userId: 'user-1',
    username: 'alice',
    email: 'alice@example.com',
    createdAt: new Date().toISOString(),
    bio: "Hello, I'm Alice",
    followerCount: 0,
  });

  const postOp = yield* PostEntity.insertOp({
    postId: 'post-1',
    authorId: 'user-1',
    title: 'Hello World',
    content: 'This is my first post',
    createdAt: new Date().toISOString(),
    tags: ['intro', 'hello'],
    likeCount: 0,
    viewCount: 0,
  });

  yield* table.transact([userOp, postOp]);
});

// =============================================================================
// Runtime provenance validation
// =============================================================================
// Ops carry a reference to the table that produced them. Passing an op built
// from an entity of a *different* table to table.transact() dies at runtime:
//
// const otherTable = DynamoTable.make().primary("pk", "sk").build();
// const OtherEntity = otherTable.entity(otherSchema).primary().build();
// const otherOp = yield* OtherEntity.insertOp({...});
//
// table.transact([otherOp]);  // dies: produced by a different table instance
