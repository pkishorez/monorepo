import { ESchema } from "@std-toolkit/eschema";
import { Schema } from "effect";

export const UserSchema = ESchema.make("User", "id", {
  name: Schema.String,
  email: Schema.String,
  status: Schema.Literal("active", "inactive", "pending"),
})
  .evolve(
    "v2",
    {
      evolution: Schema.Literal("v2 test!"),
    },
    (v) => ({ ...v, evolution: "v2 test!" as const }),
  )
  .evolve("v3", {}, (v) => v)
  .build();

export type User = typeof UserSchema.Type;

export class NotFoundError extends Schema.TaggedError<NotFoundError>()(
  "NotFoundError",
  { message: Schema.String },
) {}

const UserNotFound = Schema.Struct({
  _tag: Schema.Literal("UserNotFound"),
  id: Schema.String,
});

const ValidationFailed = Schema.Struct({
  _tag: Schema.Literal("ValidationFailed"),
  message: Schema.String,
});

const DatabaseError = Schema.Struct({
  _tag: Schema.Literal("DatabaseError"),
  operation: Schema.String,
  cause: Schema.String,
});

const UserErrorType = Schema.Union(UserNotFound, ValidationFailed, DatabaseError);

export class UserError extends Schema.TaggedError<UserError>()("UserError", {
  error: UserErrorType,
}) {
  static userNotFound(id: string) {
    return new UserError({ error: { _tag: "UserNotFound", id } });
  }

  static validation(message: string) {
    return new UserError({ error: { _tag: "ValidationFailed", message } });
  }

  static database(operation: string, cause: string) {
    return new UserError({ error: { _tag: "DatabaseError", operation, cause } });
  }
}
