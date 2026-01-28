import { ESchema } from "@std-toolkit/eschema";
import { Brand, Schema } from "effect";

// Check what ESchema produces
const UserSchema = ESchema.make("User", "userId", {
  email: Schema.String,
  name: Schema.String,
}).build();

// Type test: what is the Type of the schema?
type UserType = typeof UserSchema.Type;
//   ^? Should show: { userId: string & Brand.Brand<"UserId">; email: string; name: string; _v: string }

// Try to assign plain string - this SHOULD error if branding is enforced
const testInput: Omit<UserType, "_v"> = {
  userId: UserSchema.makeId("plain-string"), // Does this error? It shouldn't if branding is loose
  email: "test@example.com",
  name: "Test",
};

// Check the branded schema directly
const brandedSchema = Schema.String.pipe(Schema.brand("UserId"));
type BrandedType = typeof brandedSchema.Type;
//   ^? string & Brand.Brand<"UserId">
type BrandedEncoded = typeof brandedSchema.Encoded;
//   ^? string (not branded - this is normal)

// The issue: BrandedIdSchema expects BOTH Type and Encoded to be branded,
// but Schema.brand only brands the Type, not Encoded.
// This means the cast in ESchema.make might be hiding a type mismatch.

// Let's verify by looking at what makeId produces
const brandedId = UserSchema.makeId("u1");
//    ^? string & Brand.Brand<"UserId">

console.log("Type checks passed - see type annotations above");
