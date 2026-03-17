import { SQLiteTable } from "@std-toolkit/sqlite";

export const table = SQLiteTable.make({ tableName: "std_data" })
  .primary("pk", "sk")
  .index("IDX1", "IDX1PK", "IDX1SK")
  .index("IDX2", "IDX2PK", "IDX2SK")
  .index("IDX3", "IDX3PK", "IDX3SK")
  .index("IDX4", "IDX4PK", "IDX4SK")
  .build();
