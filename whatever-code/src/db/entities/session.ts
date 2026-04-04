import { SQLiteEntity } from "@std-toolkit/sqlite";
import { sessionEntity } from "../../entity/session/index.js";
import { table } from "../table.js";

export const sessionSqliteEntity = SQLiteEntity.make(table)
  .eschema(sessionEntity)
  .primary()
  .index("IDX1", "byStatus", { pk: ["status"] })
  .index("IDX2", "byUpdatedAt", { pk: [] })
  .index("IDX3", "byType", { pk: ["type"] })
  .build();
