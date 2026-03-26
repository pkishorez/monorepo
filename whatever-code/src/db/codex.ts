import { SQLiteEntity } from "@std-toolkit/sqlite";
import {
  codexEventEntity,
  codexTurnEntity,
} from "../entity/codex/index.js";
import { table } from "./table.js";

export const codexTurnSqliteEntity = SQLiteEntity.make(table)
  .eschema(codexTurnEntity)
  .primary()
  .index("IDX1", "bySession", { pk: ["sessionId"] })
  .index("IDX2", "byUpdatedAt", { pk: [] })
  .build();

export const codexEventSqliteEntity = SQLiteEntity.make(table)
  .eschema(codexEventEntity)
  .primary()
  .index("IDX1", "bySession", { pk: ["sessionId"] })
  .index("IDX2", "byUpdatedAt", { pk: [] })
  .build();
