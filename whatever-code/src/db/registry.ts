import { EntityRegistry } from "@std-toolkit/sqlite";
import {
  claudeMessageSqliteEntity,
  claudeTurnSqliteEntity,
  projectSqliteEntity,
} from "./claude.js";
import {
  codexEventSqliteEntity,
  codexTurnSqliteEntity,
} from "./codex.js";
import { sessionSqliteEntity } from "./session.js";
import { workflowSqliteEntity } from "./workflow.js";
import { table } from "./table.js";

export const registry = EntityRegistry.make(table)
  .register(claudeMessageSqliteEntity)
  .register(claudeTurnSqliteEntity)
  .register(projectSqliteEntity)
  .register(sessionSqliteEntity)
  .register(codexTurnSqliteEntity)
  .register(codexEventSqliteEntity)
  .register(workflowSqliteEntity)
  .build();
