import { SQLiteEntity } from "@std-toolkit/sqlite";
import { ralphLoopTaskEntity } from "../../entity/index.js";
import { table } from "../../../db/table.js";

export const ralphLoopTaskSqliteEntity = SQLiteEntity.make(table)
  .eschema(ralphLoopTaskEntity)
  .primary()
  .index("IDX1", "byRalphLoop", { pk: ["ralphLoopId"] })
  .index("IDX2", "byUpdatedAt", { pk: [] })
  .index("IDX3", "byStatus", { pk: ["status"] })
  .build();
