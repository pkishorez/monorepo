import { SQLiteTable } from "@std-toolkit/sqlite";
import { UserSchema } from "./schemas";

export const UsersTable = SQLiteTable.make(UserSchema)
  .primary(["id"])
  .index("byEmail", ["email"])
  .index("byStatus", ["status", "_u"])
  .build();
