import { Effect, Console } from "effect";
import {
  createPlaygroundTable,
  deletePlaygroundTable,
  PLAYGROUND_TABLE,
  LOCAL_ENDPOINT,
} from "./table.js";
import { PostEntity } from "./entities.js";

// =============================================================================
// Query Playground - Demonstrating different query methods
// =============================================================================
const play = Effect.gen(function* () {
  yield* Console.log("\n========================================");
  yield* Console.log("       Query Methods Demo");
  yield* Console.log("========================================\n");

  // ---------------------------------------------------------------------------
  // Insert 10 Posts (5 by alice, 5 by bob)
  // ---------------------------------------------------------------------------
  yield* Console.log("[1] Inserting 10 posts...\n");

  const posts = [
    {
      authorId: "alice",
      postId: "post-01",
      title: "Effect Basics",
      createdAt: "2024-01-01T10:00:00Z",
      tags: ["effect"],
      likeCount: 10,
      viewCount: 100,
    },
    {
      authorId: "alice",
      postId: "post-02",
      title: "Effect Layers",
      createdAt: "2024-01-02T10:00:00Z",
      tags: ["effect"],
      likeCount: 20,
      viewCount: 200,
    },
    {
      authorId: "alice",
      postId: "post-03",
      title: "Effect Streams",
      createdAt: "2024-01-03T10:00:00Z",
      tags: ["effect"],
      likeCount: 30,
      viewCount: 300,
    },
    {
      authorId: "alice",
      postId: "post-04",
      title: "Effect Testing",
      createdAt: "2024-01-04T10:00:00Z",
      tags: ["effect"],
      likeCount: 40,
      viewCount: 400,
    },
    {
      authorId: "alice",
      postId: "post-05",
      title: "Effect in Prod",
      createdAt: "2024-01-05T10:00:00Z",
      tags: ["effect"],
      likeCount: 50,
      viewCount: 500,
    },
    {
      authorId: "bob",
      postId: "post-06",
      title: "TypeScript Tips",
      createdAt: "2024-01-06T10:00:00Z",
      tags: ["typescript"],
      likeCount: 15,
      viewCount: 150,
    },
    {
      authorId: "bob",
      postId: "post-07",
      title: "TypeScript Generics",
      createdAt: "2024-01-07T10:00:00Z",
      tags: ["typescript"],
      likeCount: 25,
      viewCount: 250,
    },
    {
      authorId: "bob",
      postId: "post-08",
      title: "TypeScript Patterns",
      createdAt: "2024-01-08T10:00:00Z",
      tags: ["typescript"],
      likeCount: 35,
      viewCount: 350,
    },
    {
      authorId: "bob",
      postId: "post-09",
      title: "TypeScript 5.0",
      createdAt: "2024-01-09T10:00:00Z",
      tags: ["typescript"],
      likeCount: 45,
      viewCount: 450,
    },
    {
      authorId: "bob",
      postId: "post-10",
      title: "TypeScript ESM",
      createdAt: "2024-01-10T10:00:00Z",
      tags: ["typescript"],
      likeCount: 55,
      viewCount: 550,
    },
  ];

  for (const post of posts) {
    yield* PostEntity.insert({ ...post, content: `Content for ${post.title}` });
    yield* Console.log(
      `    Inserted: ${post.authorId}/${post.postId} - ${post.title}`,
    );
  }

  // ---------------------------------------------------------------------------
  // Query Method 1: All items ascending
  // ---------------------------------------------------------------------------
  yield* Console.log("\n[2] query({ pk, sk: { '>=': null } }) - All posts ascending\n");

  const q1 = yield* PostEntity.query("primary", { pk: { authorId: "alice" }, sk: { ">=": null } });
  yield* Console.log(`    Found ${q1.items.length} posts:`);
  for (const p of q1.items) {
    yield* Console.log(`    - ${p.value.postId}: ${p.value.title}`);
  }

  // ---------------------------------------------------------------------------
  // Query Method 2: All items descending
  // ---------------------------------------------------------------------------
  yield* Console.log("\n[3] query({ pk, sk: { '<=': null } }) - All posts descending\n");

  const q2 = yield* PostEntity.query("primary", { pk: { authorId: "alice" }, sk: { "<=": null } });
  yield* Console.log(`    Found ${q2.items.length} posts:`);
  for (const p of q2.items) {
    yield* Console.log(`    - ${p.value.postId}: ${p.value.title}`);
  }

  // ---------------------------------------------------------------------------
  // Query Method 3: First N items ascending
  // ---------------------------------------------------------------------------
  yield* Console.log("\n[4] query({ pk, sk: { '>=': null } }, { limit }) - First 2 posts\n");

  const q3 = yield* PostEntity.query(
    "primary",
    { pk: { authorId: "alice" }, sk: { ">=": null } },
    { limit: 2 },
  );
  yield* Console.log(`    Found ${q3.items.length} posts:`);
  for (const p of q3.items) {
    yield* Console.log(`    - ${p.value.postId}: ${p.value.title}`);
  }

  // ---------------------------------------------------------------------------
  // Query Method 4: Last N items descending
  // ---------------------------------------------------------------------------
  yield* Console.log("\n[5] query({ pk, sk: { '<=': null } }, { limit }) - Last 2 posts\n");

  const q4 = yield* PostEntity.query(
    "primary",
    { pk: { authorId: "alice" }, sk: { "<=": null } },
    { limit: 2 },
  );
  yield* Console.log(`    Found ${q4.items.length} posts:`);
  for (const p of q4.items) {
    yield* Console.log(`    - ${p.value.postId}: ${p.value.title}`);
  }

  // ---------------------------------------------------------------------------
  // Query Method 5: From specific sk onwards (ascending)
  // ---------------------------------------------------------------------------
  yield* Console.log(
    "\n[6] query({ pk, sk: { '>=': { postId } } }) - Posts from post-03\n",
  );

  const q5 = yield* PostEntity.query("primary", {
    pk: { authorId: "alice" },
    sk: { ">=": "post-03" },
  });
  yield* Console.log(`    Found ${q5.items.length} posts:`);
  for (const p of q5.items) {
    yield* Console.log(`    - ${p.value.postId}: ${p.value.title}`);
  }

  // ---------------------------------------------------------------------------
  // Query Method 6: GSI query ascending (SK is automatically _uid)
  // ---------------------------------------------------------------------------
  yield* Console.log(
    "\n[7] query('byAuthor', { pk, sk: { '>=': null } }) - GSI all posts by bob\n",
  );

  const q6 = yield* PostEntity.query("byAuthor", {
    pk: { authorId: "bob" },
    sk: { ">=": null },
  });
  yield* Console.log(`    Found ${q6.items.length} posts:`);
  for (const p of q6.items) {
    yield* Console.log(
      `    - ${p.value.postId}: ${p.value.title} (${p.value.createdAt})`,
    );
  }

  // ---------------------------------------------------------------------------
  // Query Method 7: GSI query (SK is _uid for secondary indexes)
  // ---------------------------------------------------------------------------
  yield* Console.log(
    "\n[8] query('byAuthor') - Secondary indexes use _uid as SK (time-ordered)\n",
  );

  // Note: Secondary indexes now always use _uid as SK for time-ordered results
  const q7 = yield* PostEntity.query("byAuthor", {
    pk: { authorId: "bob" },
    sk: { "<=": null }, // All items descending by _uid (most recent first)
  });
  yield* Console.log(`    Found ${q7.items.length} posts (most recent first):`);
  for (const p of q7.items) {
    yield* Console.log(
      `    - ${p.value.postId}: ${p.value.title} (${p.value.createdAt})`,
    );
  }

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  yield* Console.log("\n========================================");
  yield* Console.log("       Query Methods Summary");
  yield* Console.log("========================================");
  yield* Console.log("query() - Simple queries with explicit direction:");
  yield* Console.log("  { sk: { '>=': null } }       - All items ascending");
  yield* Console.log("  { sk: { '<=': null } }       - All items descending");
  yield* Console.log("  { sk: { '>=': null } }, { limit } - First N");
  yield* Console.log("  { sk: { '<=': null } }, { limit } - Last N");
  yield* Console.log("  { sk: { '>=': value } }      - From value onwards (asc)");
  yield* Console.log("  { sk: { '<=': value } }      - Up to value (desc)");
  yield* Console.log("========================================\n");
});

// =============================================================================
// Main Entry Point
// =============================================================================
async function main() {
  console.log("Starting Query Playground...\n");
  console.log(`Table: ${PLAYGROUND_TABLE}`);
  console.log(`Endpoint: ${LOCAL_ENDPOINT}\n`);

  try {
    await createPlaygroundTable();
    await Effect.runPromise(play);
    console.log("\nPlayground completed successfully!");
  } catch (error) {
    console.error("\nPlayground failed:", error);
    await deletePlaygroundTable();
    process.exit(1);
  }
}

main();
