import Database from "better-sqlite3";
import { ESchema } from "@std-toolkit/eschema";
import { Effect, Schema } from "effect";
import { SqliteDBBetterSqlite3 } from "../src/sql/adapters/better-sqlite3.js";
import { SQLiteTable } from "../src/services/SQLiteTable.js";
import { SQLiteEntity } from "../src/services/SQLiteEntity.js";
import { EntityRegistry } from "../src/registry/entity-registry.js";

// ─── Schemas ─────────────────────────────────────────────────────────────────

const UserSchema = ESchema.make("User", "userId", {
  email: Schema.String,
  name: Schema.String,
  status: Schema.Literal("active", "inactive"),
}).build();

const PostSchema = ESchema.make("Post", "postId", {
  authorId: Schema.String,
  title: Schema.String,
  content: Schema.String,
  published: Schema.Boolean,
}).build();

// ─── Type Helpers ────────────────────────────────────────────────────────────

// The branded ID type - use this for type-safe ID references
type UserId = (typeof UserSchema.Type)["userId"];
//   ^? string & Brand.Brand<"UserId">

type PostId = (typeof PostSchema.Type)["postId"];
//   ^? string & Brand.Brand<"PostId">

// Helper to create branded IDs (for type safety when passing between functions)
const userId = (id: string): UserId => UserSchema.makeId(id);
const postId = (id: string): PostId => PostSchema.makeId(id);

// ─── Table & Entities ────────────────────────────────────────────────────────

const table = SQLiteTable.make({ tableName: "std_data" })
  .primary("pk", "sk")
  .index("IDX1", "IDX1PK", "IDX1SK")
  .index("IDX2", "IDX2PK", "IDX2SK")
  .build();

// User entity: pk = "User", sk = userId
const userEntity = SQLiteEntity.make(table)
  .eschema(UserSchema)
  .primary() // pk: entity name only, sk: userId (idField)
  .index("IDX1", "byEmail", { pk: ["email"] }) // sk: _uid
  .index("IDX2", "byStatus", { pk: ["status"] }) // sk: _uid
  .build();

// Post entity: pk = "Post#authorId", sk = postId
const postEntity = SQLiteEntity.make(table)
  .eschema(PostSchema)
  .primary({ pk: ["authorId"] }) // sk: postId (idField)
  .index("IDX1", "byAuthor", { pk: ["authorId"] }) // sk: _uid
  .build();

const registry = EntityRegistry.make(table)
  .register(userEntity)
  .register(postEntity)
  .build();

// ─── Program ─────────────────────────────────────────────────────────────────

const program = Effect.gen(function* () {
  yield* registry.setup();
  yield* table.dangerouslyRemoveAllRows("i know what i am doing");

  console.log("=== SQLiteEntity Playground ===\n");

  // ─── Insert with Branded IDs ─────────────────────────────────────────────
  console.log("--- Inserting Users (with branded IDs) ---");

  // Option 1: Pass plain strings (convenient, but loses compile-time type safety)
  const user1 = yield* userEntity.insert({
    userId: "u1", // plain string - works but no type safety
    email: "alice@example.com",
    name: "Alice",
    status: "active",
  });

  // Option 2: Use makeId for compile-time type safety
  const user2 = yield* userEntity.insert({
    userId: userId("u2"), // branded - type-safe!
    email: "bob@example.com",
    name: "Bob",
    status: "active",
  });

  console.log(`Inserted: ${user1.value.name} (${user1.value.userId})`);
  console.log(`Inserted: ${user2.value.name} (${user2.value.userId})`);

  // The return type has branded userId:
  // user1.value.userId is typed as: string & Brand.Brand<"UserId">
  const returnedUserId: UserId = user1.value.userId; // Type-safe assignment!
  console.log(`Branded userId from return: ${returnedUserId}`);

  // ─── Insert Posts ────────────────────────────────────────────────────────
  console.log("\n--- Inserting Posts ---");
  const post1 = yield* postEntity.insert({
    postId: postId("p1"),
    authorId: "u1", // Could also use a branded AuthorId if we wanted
    title: "Hello World",
    content: "This is my first post!",
    published: true,
  });
  console.log(`Inserted: "${post1.value.title}" by ${post1.value.authorId}`);

  const post2 = yield* postEntity.insert({
    postId: postId("p2"),
    authorId: "u1",
    title: "Second Post",
    content: "Another post from Alice",
    published: true,
  });
  console.log(`Inserted: "${post2.value.title}"`);

  // ─── Get returns branded types ───────────────────────────────────────────
  console.log("\n--- Get by Primary Key (returns branded types) ---");
  const fetchedUser = yield* userEntity.get({ userId: userId("u1") });
  if (fetchedUser) {
    // fetchedUser.value.userId is branded!
    const fetchedId: UserId = fetchedUser.value.userId;
    console.log(`Fetched user: ${fetchedUser.value.name} (id: ${fetchedId})`);
  }

  // ─── Query returns branded types ─────────────────────────────────────────
  console.log("\n--- Query (returns branded types) ---");
  const alicePosts = yield* postEntity.query("pk", {
    pk: { authorId: "u1" },
    sk: { ">=": null },
  });
  console.log(`Alice's posts (${alicePosts.items.length}):`);
  for (const item of alicePosts.items) {
    // item.value.postId is branded!
    const pid: PostId = item.value.postId;
    console.log(`  - "${item.value.title}" (postId: ${pid})`);
  }

  // ─── Update returns branded types ────────────────────────────────────────
  console.log("\n--- Update (returns branded types) ---");
  const updated = yield* userEntity.update(
    { userId: user2.value.userId },
    { name: "Bobby" },
  );
  const updatedId: UserId = updated.value.userId; // Branded!
  console.log(`Updated: ${updated.value.name} (id: ${updatedId})`);

  // ─── Secondary Index Query ───────────────────────────────────────────────
  console.log("\n--- Query by Email (secondary index) ---");
  const byEmail = yield* userEntity.query("byEmail", {
    pk: { email: "alice@example.com" },
    sk: { ">=": null },
  });
  if (byEmail.items[0]) {
    const emailUserId: UserId = byEmail.items[0].value.userId; // Branded!
    console.log(
      `Found user by email: ${byEmail.items[0].value.name} (id: ${emailUserId})`,
    );
  }

  // ─── Demonstrating type safety ───────────────────────────────────────────
  console.log("\n--- Type Safety Demo ---");

  // This function only accepts UserId, not PostId or plain string
  function processUser(id: UserId): string {
    return `Processing user: ${id}`;
  }

  // Works: using branded ID from return
  console.log(processUser(user1.value.userId));

  // Works: using makeId
  console.log(processUser(userId("u1")));

  // Would NOT compile (if we uncomment):
  // processUser(post1.value.postId);  // Error: PostId is not UserId
  // processUser("raw-string");         // Error: string is not UserId

  console.log("\n=== Done ===");
});

// ─── Run ─────────────────────────────────────────────────────────────────────

const db = new Database(":memory:");
const layer = SqliteDBBetterSqlite3(db);

Effect.runPromise(program.pipe(Effect.provide(layer)))
  .then(() => db.close())
  .catch((err) => {
    console.error(err);
    db.close();
    process.exit(1);
  });
