import { EntityRegistry } from "@std-toolkit/sqlite";
import {
  claudeMessageSqliteEntity,
  projectSqliteEntity,
} from "./claude.js";
import { codexEventSqliteEntity } from "./codex.js";
import { sessionSqliteEntity } from "./session.js";
import { turnSqliteEntity } from "./turn.js";
import { workflowSqliteEntity } from "./workflow.js";
import { table } from "./table.js";

export const registry = EntityRegistry.make(table)
  .register(claudeMessageSqliteEntity)
  .register(projectSqliteEntity)
  .register(sessionSqliteEntity)
  .register(turnSqliteEntity)
  .register(codexEventSqliteEntity)
  .register(workflowSqliteEntity)
  .build();
