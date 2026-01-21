import Database from "better-sqlite3";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ESchema } from "@std-toolkit/eschema";
import { Effect, Schema } from "effect";
import { SqliteDBBetterSqlite3 } from "../src/sql/adapters/better-sqlite3.js";
import { SqliteDB } from "../src/sql/db.js";
import { SQLiteTable } from "../src/table/table.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, "data.db");

const UserSchema = ESchema.make("User", {
  id: Schema.String,
  email: Schema.String,
  name: Schema.String,
  status: Schema.Literal("active", "inactive"),
}).build();

const UsersTable = SQLiteTable.make(UserSchema)
  .primary(["id"])
  .index("byEmail", ["email"])
  .index("byStatus", ["status", "_u"])
  .build();

const program = Effect.gen(function* () {
  yield* UsersTable.setup();

  yield* UsersTable.dangerouslyRemoveAllRows("i know what i am doing");

  // Insert 10 users
  for (let i = 1; i <= 10; i++) {
    yield* UsersTable.insert({
      id: `user-${i}`,
      email: `user${i}@example.com`,
      name: `User ${i}`,
      status: "active",
    });
  }
  console.log("Inserted 10 users");

  // Update 5 users (2, 4, 6, 8, 10)
  for (const i of [2, 4, 6, 8, 10]) {
    yield* UsersTable.update(
      { id: `user-${i}` },
      { name: `Updated User ${i}` },
    );
  }
  console.log("Updated users 2, 4, 6, 8, 10");

  // Delete 3 users (3, 5, 7)
  for (const i of [3, 5, 7]) {
    yield* UsersTable.delete({ id: `user-${i}` });
  }
  console.log("Deleted users 3, 5, 7");

  // --- Transaction tests ---
  console.log("\n--- Transaction Tests ---");

  // Test 1: Successful transaction
  yield* SqliteDB.transaction(
    Effect.gen(function* () {
      yield* UsersTable.insert({
        id: "tx-user-1",
        email: "tx1@example.com",
        name: "Transaction User 1",
        status: "active",
      });
      yield* UsersTable.insert({
        id: "tx-user-2",
        email: "tx2@example.com",
        name: "Transaction User 2",
        status: "active",
      });
    }),
  );
  console.log("Transaction 1: Committed 2 users successfully");

  // Verify users were inserted
  const txUser1 = yield* UsersTable.get({ id: "tx-user-1" });
  const txUser2 = yield* UsersTable.get({ id: "tx-user-2" });
  console.log(`Verified: ${txUser1.value.name}, ${txUser2.value.name}`);

  // Test 2: Failed transaction (should rollback)
  const rollbackResult = yield* SqliteDB.transaction(
    Effect.gen(function* () {
      yield* UsersTable.insert({
        id: "tx-user-3",
        email: "tx3@example.com",
        name: "Transaction User 3 (should rollback)",
        status: "active",
      });
      // Simulate failure
      return yield* Effect.fail(new Error("Simulated failure"));
    }),
  ).pipe(Effect.catchAll(() => Effect.succeed("rolled back" as const)));
  console.log(`Transaction 2: ${rollbackResult}`);

  // Verify user was NOT inserted due to rollback
  const checkRollback = yield* UsersTable.get({ id: "tx-user-3" }).pipe(
    Effect.map(() => "found (ERROR!)"),
    Effect.catchAll(() => Effect.succeed("not found (correct!)")),
  );
  console.log(`Rollback verification: tx-user-3 is ${checkRollback}`);

  console.log(`\nDatabase saved at: ${dbPath}`);
});

const db = new Database(dbPath);
const layer = SqliteDBBetterSqlite3(db);

Effect.runPromise(program.pipe(Effect.provide(layer)))
  .then(() => db.close())
  .catch((err) => {
    console.error(err);
    db.close();
    process.exit(1);
  });
