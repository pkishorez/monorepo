import { SQLiteTable, SQLiteEntity, EntityRegistry } from "@std-toolkit/sqlite";
import { UserSchema } from "./schemas";

// Table definition (single-table design)
export const UsersTable = SQLiteTable.make({ tableName: "std_data" })
  .primary("pk", "sk")
  .index("IDX1", "IDX1PK", "IDX1SK")
  .build();

// Entity definition (maps ESchema to table)
export const UserEntity = SQLiteEntity.make(UsersTable)
  .eschema(UserSchema)
  .primary() // pk: "User", sk: id (from idField)
  .index("IDX1", "byUpdates", { pk: [] }) // sk: _uid (automatic)
  .build();

// Registry for setup
export const registry = EntityRegistry.make(UsersTable)
  .register(UserEntity)
  .build();
