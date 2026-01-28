import { Effect, Schema } from "effect";
import { ESchema, BrandedId } from "./index";

// Define a User schema with "id" as the ID field
const UserSchema = ESchema.make("User", "id", {
  name: Schema.String,
  email: Schema.String,
  age: Schema.Number,
}).build();

// Define a Post schema with "postId" as the ID field
const PostSchema = ESchema.make("Post", "postId", {
  title: Schema.String,
  content: Schema.String,
  authorId: Schema.String, // Could use brandedString("UserId") for cross-entity type safety
})
  .evolve("v2", { tags: Schema.Array(Schema.String) }, (prev) => ({
    ...prev,
    tags: [],
  }))
  .build();

// Type aliases for convenience
type UserId = BrandedId<"User">; // string & Brand<"UserId">
type User = typeof UserSchema.Type;
type Post = typeof PostSchema.Type;

async function main() {
  console.log("=== ESchema Demo ===\n");

  // 1. Creating branded IDs
  console.log("1. Creating branded IDs:");
  const userId: UserId = UserSchema.makeId("user-123");
  console.log(`   userId: ${userId}`);
  console.log(`   idField: ${UserSchema.idField}`);
  console.log();

  // 2. Encoding with branded ID
  console.log("2. Encoding a user:");
  const encoded = await Effect.runPromise(
    UserSchema.encode({
      id: UserSchema.makeId("user-456"),
      name: "Alice",
      email: "alice@example.com",
      age: 30,
    }),
  );
  console.log(`   Encoded:`, encoded);
  console.log(`   encoded.id is branded:`, encoded.id); // Type: string & Brand<"UserId">
  console.log();

  // 3. Decoding returns branded ID
  console.log("3. Decoding raw data:");
  const decoded = await Effect.runPromise(
    UserSchema.decode({
      id: "user-789",
      name: "Bob",
      email: "bob@example.com",
      age: 25,
    }),
  );
  console.log(`   Decoded:`, decoded);
  console.log(`   decoded.id is branded:`, decoded.id); // Type: string & Brand<"UserId">
  console.log();

  // 4. Re-encoding decoded data (ID stays branded)
  console.log("4. Re-encoding decoded data:");
  const reEncoded = await Effect.runPromise(
    UserSchema.encode(decoded), // decoded.id is already branded, no makeId needed
  );
  console.log(`   Re-encoded:`, reEncoded);
  console.log();

  // 5. Schema evolution with migrations
  console.log("5. Schema evolution (Post v1 -> v2):");
  const postV1Data = {
    _v: "v1" as const,
    postId: "post-001",
    title: "Hello World",
    content: "This is my first post",
    authorId: "user-456",
  };
  const migratedPost = await Effect.runPromise(PostSchema.decode(postV1Data));
  console.log(`   V1 input:`, postV1Data);
  console.log(`   Migrated to V2:`, migratedPost);
  console.log(`   Tags added:`, migratedPost.tags); // Empty array from migration
  console.log();

  // 6. JSON Schema descriptor
  console.log("6. JSON Schema descriptor:");
  const descriptor = UserSchema.getDescriptor();
  console.log(`   Properties:`, Object.keys(descriptor.properties));
  console.log(`   $defs:`, Object.keys(descriptor.$defs || {}));
  console.log(`   ID reference:`, descriptor.properties.id);
  console.log();

  // 7. makePartial for partial updates
  console.log("7. makePartial for partial updates:");
  const partial = UserSchema.makePartial({ name: "Updated Name" });
  console.log(`   Partial:`, partial);
  console.log();

  // 8. Standard Schema validation
  console.log("8. Standard Schema validation:");
  const validResult = UserSchema["~standard"].validate({
    id: "user-999",
    name: "Charlie",
    email: "charlie@example.com",
    age: 35,
  });
  console.log(`   Valid input result:`, validResult);

  const invalidResult = UserSchema["~standard"].validate({
    _v: "v99", // Unknown version
    id: "user-999",
    name: "Charlie",
  });
  console.log(`   Invalid input result:`, invalidResult);
}

main().catch(console.error);
