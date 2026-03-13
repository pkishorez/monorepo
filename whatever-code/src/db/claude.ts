import { EntityRegistry, SQLiteEntity } from "@std-toolkit/sqlite";
import {
  claudeMessageEntity,
  claudeSessionEntity,
} from "../entity/claude/index.js";
import { table } from "./table.js";

export const claudeMessageSqliteEntity = SQLiteEntity.make(table)
  .eschema(claudeMessageEntity)
  .primary()
  .index("IDX1", "bySession", { pk: ["sessionId"] })
  .build();

export const claudeSessionSqliteEntity = SQLiteEntity.make(table)
  .eschema(claudeSessionEntity)
  .primary()
  .build();

export const registry = EntityRegistry.make(table)
  .register(claudeMessageSqliteEntity)
  .register(claudeSessionSqliteEntity)
  .build();
