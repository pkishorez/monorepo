import { ESchema } from "@std-toolkit/eschema";
import { Schema } from "effect";

// ESchema-based User
export const UserSchema = ESchema.make("User", {
  id: Schema.String,
  name: Schema.String,
  email: Schema.String,
  status: Schema.Literal("active", "inactive", "pending"),
}).build();

export type User = typeof UserSchema.Type;

// Error types
export class NotFoundError extends Schema.TaggedError<NotFoundError>()(
  "NotFoundError",
  { message: Schema.String }
) {}

export class UserNotFoundError extends Schema.TaggedError<UserNotFoundError>()(
  "UserNotFoundError",
  { id: Schema.String }
) {}

export class UserValidationError extends Schema.TaggedError<UserValidationError>()(
  "UserValidationError",
  { message: Schema.String }
) {}

export class UserDatabaseError extends Schema.TaggedError<UserDatabaseError>()(
  "UserDatabaseError",
  { operation: Schema.String, cause: Schema.String }
) {}
