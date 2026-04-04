import { SQLiteEntity } from "@std-toolkit/sqlite";
import { codexEventEntity } from "../../entity/codex/index.js";
import { table } from "../table.js";

export const codexEventSqliteEntity = SQLiteEntity.make(table)
  .eschema(codexEventEntity)
  .primary()
  .index("IDX1", "bySession", { pk: ["sessionId"] })
  .index("IDX2", "byUpdatedAt", { pk: [] })
  .build();
