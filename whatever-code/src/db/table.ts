import { SQLiteTable } from "@std-toolkit/sqlite";

export const table = SQLiteTable.make({ tableName: "std_data" })
  .primary("pk", "sk")
  .index("IDX1", "IDX1PK", "IDX1SK")
  .build();
