import { Effect, Console } from "effect";
import {
  table,
  createPlaygroundTable,
  deletePlaygroundTable,
  PLAYGROUND_TABLE,
  LOCAL_ENDPOINT,
} from "./table.js";
import { UserEntity, PostEntity, CommentEntity } from "./entities.js";
import { exprUpdate, exprFilter, buildExpr, opAdd } from "../index.js";

// =============================================================================
// Playground Operations
// =============================================================================
const playOff = Effect.gen(function* () {
  yield* Console.log("\n========================================");
  yield* Console.log("       DynamoDB Playground");
  yield* Console.log("========================================\n");

  // ---------------------------------------------------------------------------
  // 1. Insert Users
  // ---------------------------------------------------------------------------
  yield* Console.log("[1] Creating users...");

  const user1 = yield* UserEntity.insert({
    id: "user-001",
    username: "alice",
    email: "alice@example.com",
    createdAt: new Date().toISOString(),
    bio: "Software engineer who loves Effect",
    followerCount: 150,
  });
  yield* Console.log(
    `    Created: ${user1.value.username} (${user1.value.id})`,
  );

  const user2 = yield* UserEntity.insert({
    id: "user-002",
    username: "bob",
    email: "bob@example.com",
    createdAt: new Date().toISOString(),
    bio: "TypeScript enthusiast",
    followerCount: 89,
  });
  yield* Console.log(
    `    Created: ${user2.value.username} (${user2.value.id})`,
  );

  const user3 = yield* UserEntity.insert({
    id: "user-003",
    username: "charlie",
    email: "charlie@example.com",
    createdAt: new Date().toISOString(),
    bio: "Backend developer",
    followerCount: 230,
  });
  yield* Console.log(
    `    Created: ${user3.value.username} (${user3.value.id})`,
  );

  // ---------------------------------------------------------------------------
  // 2. Insert Posts
  // ---------------------------------------------------------------------------
  yield* Console.log("\n[2] Creating posts...");

  const post1 = yield* PostEntity.insert({
    id: "post-001",
    authorId: "user-001",
    title: "Getting Started with Effect",
    content:
      "Effect is a powerful library for building type-safe applications...",
    createdAt: "2024-01-15T10:00:00Z",
    tags: ["effect", "typescript", "tutorial"],
    likeCount: 42,
    viewCount: 1500,
  });
  yield* Console.log(`    Created: "${post1.value.title}"`);

  const post2 = yield* PostEntity.insert({
    id: "post-002",
    authorId: "user-001",
    title: "DynamoDB Best Practices",
    content:
      "When designing DynamoDB tables, single-table design is often recommended...",
    createdAt: "2024-01-20T14:30:00Z",
    tags: ["dynamodb", "aws", "database"],
    likeCount: 28,
    viewCount: 980,
  });
  yield* Console.log(`    Created: "${post2.value.title}"`);

  const post3 = yield* PostEntity.insert({
    id: "post-003",
    authorId: "user-002",
    title: "TypeScript Tips and Tricks",
    content: "Here are some advanced TypeScript patterns you should know...",
    createdAt: "2024-01-22T09:15:00Z",
    tags: ["typescript", "tips"],
    likeCount: 65,
    viewCount: 2100,
  });
  yield* Console.log(`    Created: "${post3.value.title}"`);

  // ---------------------------------------------------------------------------
  // 3. Insert Comments
  // ---------------------------------------------------------------------------
  yield* Console.log("\n[3] Creating comments...");

  yield* CommentEntity.insert({
    id: "comment-001",
    postId: "post-001",
    authorId: "user-002",
    content: "Great introduction! Effect has been a game changer for me.",
    createdAt: "2024-01-15T11:30:00Z",
    editedAt: null,
  });
  yield* Console.log("    Created: comment on post-001 by user-002");

  yield* CommentEntity.insert({
    id: "comment-002",
    postId: "post-001",
    authorId: "user-003",
    content: "Thanks for sharing! Very helpful.",
    createdAt: "2024-01-15T12:45:00Z",
    editedAt: null,
  });
  yield* Console.log("    Created: comment on post-001 by user-003");

  yield* CommentEntity.insert({
    id: "comment-003",
    postId: "post-003",
    authorId: "user-001",
    content: "Love these tips! The mapped types section is especially useful.",
    createdAt: "2024-01-22T10:00:00Z",
    editedAt: null,
  });
  yield* Console.log("    Created: comment on post-003 by user-001");

  // ---------------------------------------------------------------------------
  // 4. Query Operations
  // ---------------------------------------------------------------------------
  yield* Console.log("\n[4] Query operations...");

  // Get a specific user
  yield* Console.log("\n    [get] User by ID:");
  const fetchedUser = yield* UserEntity.get({ id: "user-001" });
  if (fetchedUser) {
    yield* Console.log(
      `    Found: ${fetchedUser.value.username} - ${fetchedUser.value.bio}`,
    );
    yield* Console.log(
      `    Meta: _e=${fetchedUser.meta._e}, _v=${fetchedUser.meta._v}, _i=${fetchedUser.meta._i}`,
    );
  }

  // Get all posts by an author
  yield* Console.log("\n    [query] Posts by user-001:");
  const authorPosts = yield* PostEntity.query({
    pk: { authorId: "user-001" },
  });
  yield* Console.log(`    Found ${authorPosts.items.length} posts:`);
  for (const post of authorPosts.items) {
    yield* Console.log(
      `    - "${post.value.title}" (${post.value.likeCount} likes)`,
    );
  }

  // Get all comments on a post
  yield* Console.log("\n    [query] Comments on post-001:");
  const postComments = yield* CommentEntity.query({
    pk: { postId: "post-001" },
  });
  yield* Console.log(`    Found ${postComments.items.length} comments`);

  // Query using GSI
  yield* Console.log("\n    [index query] Posts by author (GSI):");
  const postsByGsi = yield* PostEntity.index("byAuthor").query({
    pk: { authorId: "user-001" },
  });
  yield* Console.log(
    `    Found ${postsByGsi.items.length} posts via byAuthor GSI`,
  );

  // ---------------------------------------------------------------------------
  // 5. Update Operations
  // ---------------------------------------------------------------------------
  yield* Console.log("\n[5] Update operations...");

  // Simple update
  yield* Console.log("\n    [update] User bio:");
  const updatedUser = yield* UserEntity.update(
    { id: "user-001" },
    {
      bio: "Software engineer who loves Effect and DynamoDB",
      followerCount: 155,
    },
  );
  yield* Console.log(`    New bio: "${updatedUser.value.bio}"`);
  yield* Console.log(`    Meta _i: ${updatedUser.meta._i}`);

  // Update with optimistic locking
  yield* Console.log("\n    [update] Post with optimistic locking:");
  const fetchedPost = yield* PostEntity.get({
    authorId: "user-001",
    id: "post-001",
  });
  if (fetchedPost) {
    const updatedPost = yield* PostEntity.update(
      { authorId: "user-001", id: "post-001" },
      { likeCount: 50, viewCount: 1600 },
      { meta: { _i: fetchedPost.meta._i } },
    );
    yield* Console.log(
      `    Likes: ${updatedPost.value.likeCount}, Views: ${updatedPost.value.viewCount}`,
    );
  }

  // Edit comment
  yield* Console.log("\n    [update] Edit comment:");
  const updatedComment = yield* CommentEntity.update(
    { postId: "post-001", id: "comment-001" },
    {
      content: "Great introduction! Highly recommend!",
      editedAt: new Date().toISOString(),
    },
  );
  yield* Console.log(`    Edited at: ${updatedComment.value.editedAt}`);

  // ---------------------------------------------------------------------------
  // 6. Low-level Table Operations
  // ---------------------------------------------------------------------------
  yield* Console.log("\n[6] Low-level table operations...");

  // putItem
  yield* Console.log("\n    [putItem] Insert raw item:");
  yield* table.putItem({
    pk: "MISC#analytics",
    sk: "DAILY#2024-01-26",
    pageViews: 5000,
    uniqueVisitors: 1200,
  });
  yield* Console.log("    Inserted analytics record");

  // getItem
  yield* Console.log("\n    [getItem] Get raw item:");
  const rawItem = yield* table.getItem({
    pk: "MISC#analytics",
    sk: "DAILY#2024-01-26",
  });
  if (rawItem.Item) {
    yield* Console.log(`    Page views: ${rawItem.Item.pageViews}`);
  }

  // updateItem with expression builder
  yield* Console.log("\n    [updateItem] Atomic increment:");
  const update = exprUpdate<{ pageViews: number }>(($) => [
    $.set("pageViews", opAdd("pageViews", 100)),
  ]);
  const expr = buildExpr({ update });
  const updateResult = yield* table.updateItem(
    { pk: "MISC#analytics", sk: "DAILY#2024-01-26" },
    { ...expr, ReturnValues: "ALL_NEW" },
  );
  yield* Console.log(
    `    New page views: ${updateResult.Attributes?.pageViews}`,
  );

  // Query with filter
  yield* Console.log("\n    [query + filter] Posts with > 30 likes:");
  const filter = exprFilter<{ likeCount: number }>(($) =>
    $.cond("likeCount", ">", 30),
  );
  const filteredPosts = yield* PostEntity.query(
    { pk: { authorId: "user-001" } },
    { filter },
  );
  yield* Console.log(`    Found ${filteredPosts.items.length} posts`);

  // ---------------------------------------------------------------------------
  // 7. Transactions
  // ---------------------------------------------------------------------------
  yield* Console.log("\n[7] Transaction operations...");

  yield* Console.log("\n    [transact] Create user + post atomically:");
  yield* table.transact([
    yield* UserEntity.insertOp({
      id: "user-004",
      username: "diana",
      email: "diana@example.com",
      createdAt: new Date().toISOString(),
      bio: "New user joining the platform",
      followerCount: 0,
    }),
    yield* PostEntity.insertOp({
      id: "post-004",
      authorId: "user-004",
      title: "Hello World!",
      content: "Excited to be here!",
      createdAt: new Date().toISOString(),
      tags: ["introduction"],
      likeCount: 0,
      viewCount: 0,
    }),
  ]);
  yield* Console.log("    Transaction completed");

  // Verify
  const newUser = yield* UserEntity.get({ id: "user-004" });
  const newPost = yield* PostEntity.get({
    authorId: "user-004",
    id: "post-004",
  });
  if (newUser && newPost) {
    yield* Console.log(
      `    Verified: ${newUser.value.username} created "${newPost.value.title}"`,
    );
  }

  // ---------------------------------------------------------------------------
  // 8. Error Handling
  // ---------------------------------------------------------------------------
  yield* Console.log("\n[8] Error handling...");

  // Duplicate insert
  yield* Console.log("\n    [error] Duplicate insert:");
  const dupResult = yield* UserEntity.insert({
    id: "user-001",
    username: "duplicate",
    email: "dup@example.com",
    createdAt: new Date().toISOString(),
    bio: "",
    followerCount: 0,
  }).pipe(Effect.either);
  yield* Console.log(`    Rejected: ${dupResult._tag === "Left"}`);

  // Optimistic locking failure
  yield* Console.log("\n    [error] Stale update:");
  const staleResult = yield* UserEntity.update(
    { id: "user-001" },
    { bio: "This should fail" },
    { meta: { _i: 0 } },
  ).pipe(Effect.either);
  yield* Console.log(`    Rejected: ${staleResult._tag === "Left"}`);

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  yield* Console.log("\n========================================");
  yield* Console.log("       Summary");
  yield* Console.log("========================================");
  yield* Console.log("- 4 users (schema v3)");
  yield* Console.log("- 4 posts (schema v3)");
  yield* Console.log("- 3 comments (schema v2)");
  yield* Console.log("- Queries: primary key, GSI, filters");
  yield* Console.log("- Updates: simple, optimistic locking");
  yield* Console.log("- Low-level: putItem, getItem, updateItem");
  yield* Console.log("- Transactions: atomic multi-item");
  yield* Console.log("- Error handling: duplicates, stale updates");
  yield* Console.log("========================================\n");
});

// =============================================================================
// Main Entry Point
// =============================================================================
async function main() {
  console.log("Starting DynamoDB Playground...\n");
  console.log(`Table: ${PLAYGROUND_TABLE}`);
  console.log(`Endpoint: ${LOCAL_ENDPOINT}\n`);

  try {
    await createPlaygroundTable();
    await Effect.runPromise(playOff);

    // console.log("\nCleaning up...");
    // await deletePlaygroundTable();

    console.log("\nPlayground completed successfully!");
  } catch (error) {
    console.error("\nPlayground failed:", error);
    console.log("\nAttempting cleanup...");
    await deletePlaygroundTable();
    process.exit(1);
  }
}

main();
