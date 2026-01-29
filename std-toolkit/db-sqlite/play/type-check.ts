import { ESchema } from "@std-toolkit/eschema";
import { Schema } from "effect";

// Check what ESchema produces
const UserSchema = ESchema.make("User", "userId", {
  email: Schema.String,
  name: Schema.String,
}).build();

// Type test: what is the Type of the schema?
type UserType = typeof UserSchema.Type;
//   ^? Should show: { userId: string; email: string; name: string }

// Plain string assignment works now
const testInput: Omit<UserType, "_v"> = {
  userId: "plain-string",
  email: "test@example.com",
  name: "Test",
};

// ID is just a plain string
const id: string = "u1";

console.log("Type checks passed - see type annotations above");
console.log(testInput, id);
