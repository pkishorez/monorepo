import { SQLiteEntity } from "@std-toolkit/sqlite";
import { workflowEntity } from "../entity/workflow/index.js";
import { table } from "./table.js";

export const workflowSqliteEntity = SQLiteEntity.make(table)
  .eschema(workflowEntity)
  .primary()
  .index("IDX1", "byProject", { pk: ["projectId"] })
  .index("IDX2", "byUpdatedAt", { pk: [] })
  .build();
