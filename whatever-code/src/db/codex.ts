import { SQLiteEntity } from "@std-toolkit/sqlite";
import {
  codexEventEntity,
  codexThreadEntity,
  codexTurnEntity,
} from "../entity/codex/index.js";
import { table } from "./table.js";

export const codexThreadSqliteEntity = SQLiteEntity.make(table)
  .eschema(codexThreadEntity)
  .primary()
  .index("IDX1", "byStatus", { pk: ["status"] })
  .index("IDX2", "byUpdatedAt", { pk: [] })
  .build();

export const codexTurnSqliteEntity = SQLiteEntity.make(table)
  .eschema(codexTurnEntity)
  .primary()
  .index("IDX1", "byThread", { pk: ["threadId"] })
  .index("IDX2", "byUpdatedAt", { pk: [] })
  .build();

export const codexEventSqliteEntity = SQLiteEntity.make(table)
  .eschema(codexEventEntity)
  .primary()
  .index("IDX1", "byThread", { pk: ["threadId"] })
  .index("IDX2", "byUpdatedAt", { pk: [] })
  .build();
