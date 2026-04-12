import { SQLiteEntity } from "@std-toolkit/sqlite";
import { ralphLoopEntity } from "../../entity/index.js";
import { table } from "../../../db/table.js";

export const ralphLoopSqliteEntity = SQLiteEntity.make(table)
  .eschema(ralphLoopEntity)
  .primary()
  .index("IDX1", "byProject", { pk: ["projectId"] })
  .index("IDX2", "byUpdatedAt", { pk: [] })
  .index("IDX3", "byStatus", { pk: ["status"] })
  .build();
