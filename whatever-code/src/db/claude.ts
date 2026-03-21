import { SQLiteEntity } from "@std-toolkit/sqlite";
import {
  claudeMessageEntity,
  claudeSessionEntity,
  claudeTurnEntity,
} from "../entity/claude/index.js";
import { projectEntity } from "../entity/project/index.js";
import { table } from "./table.js";

export const claudeMessageSqliteEntity = SQLiteEntity.make(table)
  .eschema(claudeMessageEntity)
  .primary()
  .index("IDX1", "bySession", { pk: ["sessionId"] })
  .index("IDX2", "byUpdatedAt", { pk: [] })
  .build();

export const claudeSessionSqliteEntity = SQLiteEntity.make(table)
  .eschema(claudeSessionEntity)
  .primary()
  .index("IDX1", "byStatus", { pk: ["status"] })
  .index("IDX2", "byUpdatedAt", { pk: [] })
  .build();

export const claudeTurnSqliteEntity = SQLiteEntity.make(table)
  .eschema(claudeTurnEntity)
  .primary()
  .index("IDX1", "bySession", { pk: ["sessionId"] })
  .index("IDX2", "byUpdatedAt", { pk: [] })
  .build();

export const projectSqliteEntity = SQLiteEntity.make(table)
  .eschema(projectEntity)
  .primary()
  .index("IDX1", "bySessionId", { pk: ["id"] })
  .index("IDX2", "byUpdatedAt", { pk: [] })
  .build();
