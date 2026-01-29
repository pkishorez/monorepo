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

// Type alias for the ID field type
type UserId = string;
type PostId = string;

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

  // ─── Insert Users ─────────────────────────────────────────────
  console.log("--- Inserting Users ---");

  const user1 = yield* userEntity.insert({
    userId: "u1",
    email: "alice@example.com",
    name: "Alice",
    status: "active",
  });

  const user2 = yield* userEntity.insert({
    userId: "u2",
    email: "bob@example.com",
    name: "Bob",
    status: "active",
  });

  console.log(`Inserted: ${user1.value.name} (${user1.value.userId})`);
  console.log(`Inserted: ${user2.value.name} (${user2.value.userId})`);

  const returnedUserId: UserId = user1.value.userId;
  console.log(`userId from return: ${returnedUserId}`);

  // ─── Insert Posts ────────────────────────────────────────────────────────
  console.log("\n--- Inserting Posts ---");
  const post1 = yield* postEntity.insert({
    postId: "p1",
    authorId: "u1",
    title: "Hello World",
    content: "This is my first post!",
    published: true,
  });
  console.log(`Inserted: "${post1.value.title}" by ${post1.value.authorId}`);

  const post2 = yield* postEntity.insert({
    postId: "p2",
    authorId: "u1",
    title: "Second Post",
    content: "Another post from Alice",
    published: true,
  });
  console.log(`Inserted: "${post2.value.title}"`);

  // ─── Get by Primary Key ───────────────────────────────────────────
  console.log("\n--- Get by Primary Key ---");
  const fetchedUser = yield* userEntity.get({ userId: "u1" });
  if (fetchedUser) {
    const fetchedId: UserId = fetchedUser.value.userId;
    console.log(`Fetched user: ${fetchedUser.value.name} (id: ${fetchedId})`);
  }

  // ─── Query ─────────────────────────────────────────
  console.log("\n--- Query ---");
  const alicePosts = yield* postEntity.query("pk", {
    pk: { authorId: "u1" },
    sk: { ">=": null },
  });
  console.log(`Alice's posts (${alicePosts.items.length}):`);
  for (const item of alicePosts.items) {
    const pid: PostId = item.value.postId;
    console.log(`  - "${item.value.title}" (postId: ${pid})`);
  }

  // ─── Update ────────────────────────────────────────
  console.log("\n--- Update ---");
  const updated = yield* userEntity.update(
    { userId: user2.value.userId },
    { name: "Bobby" },
  );
  const updatedId: UserId = updated.value.userId;
  console.log(`Updated: ${updated.value.name} (id: ${updatedId})`);

  // ─── Secondary Index Query ───────────────────────────────────────────────
  console.log("\n--- Query by Email (secondary index) ---");
  const byEmail = yield* userEntity.query("byEmail", {
    pk: { email: "alice@example.com" },
    sk: { ">=": null },
  });
  if (byEmail.items[0]) {
    const emailUserId: UserId = byEmail.items[0].value.userId;
    console.log(
      `Found user by email: ${byEmail.items[0].value.name} (id: ${emailUserId})`,
    );
  }

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
