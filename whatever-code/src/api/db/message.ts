import { SQLiteTable, SQLiteEntity } from "@std-toolkit/sqlite";
import { messageSchema } from "../entities/index.js";

const sqlite = SQLiteTable.make({
  tableName: "table",
})
  .primary("pk", "sk")
  .index("I1", "IPK1", "ISK2")
  .build();

export const messageEntity = SQLiteEntity.make(sqlite)
  .eschema(messageSchema)
  .primary({ pk: ["messageId"] })
  .build();
