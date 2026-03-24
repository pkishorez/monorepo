import { EntityRegistry } from "@std-toolkit/sqlite";
import {
  claudeMessageSqliteEntity,
  claudeSessionSqliteEntity,
  claudeTurnSqliteEntity,
  projectSqliteEntity,
} from "./claude.js";
import {
  codexEventSqliteEntity,
  codexThreadSqliteEntity,
  codexTurnSqliteEntity,
} from "./codex.js";
import { workflowSqliteEntity } from "./workflow.js";
import { table } from "./table.js";

export const registry = EntityRegistry.make(table)
  .register(claudeMessageSqliteEntity)
  .register(claudeSessionSqliteEntity)
  .register(claudeTurnSqliteEntity)
  .register(projectSqliteEntity)
  .register(codexThreadSqliteEntity)
  .register(codexTurnSqliteEntity)
  .register(codexEventSqliteEntity)
  .register(workflowSqliteEntity)
  .build();
