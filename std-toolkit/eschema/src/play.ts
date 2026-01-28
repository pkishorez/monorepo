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
  authorId: Schema.String,
})
  .evolve("v2", { tags: Schema.Array(Schema.String) }, (prev) => ({
    ...prev,
    tags: [],
  }))
  .build();

// Type aliases for convenience
type UserId = BrandedId<"User">; // string & Brand<"UserId">

async function main() {
  console.log("=== ESchema Demo ===\n");

  // 1. Schema properties
  console.log("1. Schema properties:");
  console.log(`   name: ${UserSchema.name}`);
  console.log(`   idField: ${UserSchema.idField}`);
  console.log(`   latestVersion: ${UserSchema.latestVersion}`);
  console.log();

  // 2. Fields - raw field definitions (includes branded ID)
  console.log("2. Fields (raw field definitions):");
  console.log(`   Field names:`, Object.keys(UserSchema.fields));
  console.log(`   ID field included: ${"id" in UserSchema.fields}`);
  console.log();

  // 3. Schema - Effect Schema.Struct (with branded ID)
  console.log("3. Schema (Effect Schema.Struct):");
  console.log(`   Fields:`, Object.keys(UserSchema.schema.fields));
  console.log();

  // 4. Creating branded IDs
  console.log("4. Creating branded IDs:");
  const userId: UserId = UserSchema.makeId("user-123");
  console.log(`   userId: ${userId}`);
  console.log();

  // 5. Encoding - same type as decoding
  console.log("5. Encoding:");
  const encoded = await Effect.runPromise(
    UserSchema.encode({
      id: UserSchema.makeId("user-456"),
      name: "Alice",
      email: "alice@example.com",
      age: 30,
    }),
  );
  type Test = (typeof UserSchema)["Type"];
  console.log(`   Encoded:`, encoded);
  console.log(`   Type: { id: UserId, name, email, age }`);
  console.log();

  // 6. Decoding - same type as encoding
  console.log("6. Decoding:");
  const decoded = await Effect.runPromise(
    UserSchema.decode({
      id: "user-789",
      name: "Bob",
      email: "bob@example.com",
      age: 25,
    }),
  );
  console.log(`   Decoded:`, decoded);
  console.log(`   Type: { id: UserId, name, email, age }`);
  console.log();

  // 7. Re-encoding - seamless, same types
  console.log("7. Re-encoding (seamless):");
  const reEncoded = await Effect.runPromise(UserSchema.encode(decoded));
  console.log(`   Re-encoded:`, reEncoded);
  console.log(`   encode(decode(x)) works directly - same types!`);
  console.log();

  // 8. Using Effect Schema directly
  console.log("8. Using Effect Schema directly:");
  const directDecode = await Effect.runPromise(
    Schema.decodeUnknown(UserSchema.schema)({
      id: "user-direct",
      name: "Direct",
      email: "direct@example.com",
      age: 40,
    }),
  );
  console.log(`   Direct decode:`, directDecode);
  console.log();

  // 9. Schema evolution
  console.log("9. Schema evolution (Post v1 -> v2):");
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
  console.log();

  // 10. JSON Schema descriptor (includes _v for storage)
  console.log("10. JSON Schema descriptor:");
  const descriptor = UserSchema.getDescriptor();
  console.log(`   Properties:`, Object.keys(descriptor.properties));
  console.log(`   $defs:`, Object.keys(descriptor.$defs || {}));
  console.log(`   ID reference:`, descriptor.properties.id);
  console.log();

  // 11. Type summary
  console.log("11. Type summary:");
  console.log(
    `   UserSchema.Type = { id: UserId, name: string, email: string, age: number }`,
  );
  console.log(`   Same type for encode() input and output`);
  console.log(`   Same type for decode() output`);
  console.log(`   _v is handled internally for versioning`);
}

main().catch(console.error);
