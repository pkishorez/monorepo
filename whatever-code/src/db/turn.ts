import { SQLiteEntity } from "@std-toolkit/sqlite";
import { turnEntity } from "../entity/turn/index.js";
import { table } from "./table.js";

export const turnSqliteEntity = SQLiteEntity.make(table)
  .eschema(turnEntity)
  .primary()
  .index("IDX1", "bySession", { pk: ["sessionId"] })
  .index("IDX2", "byUpdatedAt", { pk: [] })
  .index("IDX3", "byType", { pk: ["type"] })
  .build();
