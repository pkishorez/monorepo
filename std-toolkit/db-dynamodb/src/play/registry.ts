import { Effect } from "effect";
import { EntityRegistry } from "../index.js";
import { table } from "./table.js";
import { UserEntity, PostEntity, CommentEntity } from "./entities.js";

// =============================================================================
// Create Entity Registry
// =============================================================================
export const registry = EntityRegistry.make(table)
  .register(UserEntity)
  .register(PostEntity)
  .register(CommentEntity)
  .build();

// =============================================================================
// Type-safe entity access
// =============================================================================
// registry.entity("User")    ✓ - returns UserEntity
// registry.entity("Post")    ✓ - returns PostEntity
// registry.entity("Comment") ✓ - returns CommentEntity
// registry.entity("Invalid") ✗ - compile error

// =============================================================================
// Get schema for visualization
// =============================================================================
export function logSchema() {
  const schema = registry.getSchema();
  console.log(JSON.stringify(schema, null, 2));
}

// =============================================================================
// Type-safe transactions
// =============================================================================
export const exampleTransaction = Effect.gen(function* () {
  // Create transaction items from registered entities
  // Note: userId and postId are optional - auto-generated if not provided
  const userOp = yield* UserEntity.insertOp({
    userId: "user-1",
    username: "alice",
    email: "alice@example.com",
    createdAt: new Date().toISOString(),
    bio: "Hello, I'm Alice",
    followerCount: 0,
  });

  const postOp = yield* PostEntity.insertOp({
    postId: "post-1",
    authorId: "user-1",
    title: "Hello World",
    content: "This is my first post",
    createdAt: new Date().toISOString(),
    tags: ["intro", "hello"],
    likeCount: 0,
    viewCount: 0,
  });

  // Type-safe: only accepts TransactItem<"User" | "Post" | "Comment">
  yield* registry.transact([userOp, postOp]);
});

// =============================================================================
// Compile-time validation example
// =============================================================================
// If you try to pass an entity that's not registered, you'll get a compile error:
//
// const otherTable = DynamoTable.make({...}).primary("pk", "sk").build();
// const OtherEntity = DynamoEntity.make(otherTable).eschema(otherSchema)...
// const otherOp = yield* OtherEntity.insertOp({...});
//
// registry.transact([otherOp]);  // ✗ Compile error!
// OtherEntity's name is not in "User" | "Post" | "Comment"
