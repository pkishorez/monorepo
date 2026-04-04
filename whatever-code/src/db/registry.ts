import { EntityRegistry } from "@std-toolkit/sqlite";
import {
  claudeMessageSqliteEntity,
  projectSqliteEntity,
} from "./entities/claude.js";
import { codexEventSqliteEntity } from "./entities/codex.js";
import { sessionSqliteEntity } from "./entities/session.js";
import { turnSqliteEntity } from "./entities/turn.js";
import { workflowSqliteEntity } from "./entities/workflow.js";
import { table } from "./table.js";

export const registry = EntityRegistry.make(table)
  .register(claudeMessageSqliteEntity)
  .register(projectSqliteEntity)
  .register(sessionSqliteEntity)
  .register(turnSqliteEntity)
  .register(codexEventSqliteEntity)
  .register(workflowSqliteEntity)
  .build();
