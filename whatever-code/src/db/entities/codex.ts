import { SQLiteEntity } from "@std-toolkit/sqlite";
import { EntityESchema } from "@std-toolkit/eschema";
import { Schema } from "effect";
import { Typed } from "../../lib/typed.js";
import type { ServerNotification } from "../../agents/codex/generated/ServerNotification.js";
import { table } from "../table.js";

const codexEventEntity = EntityESchema.make("codexEvent", "id", {
  sessionId: Schema.String,
  turnId: Schema.String,
  data: Typed<ServerNotification>(),
}).build();

export const codexEventSqliteEntity = SQLiteEntity.make(table)
  .eschema(codexEventEntity)
  .primary()
  .index("IDX1", "bySession", { pk: ["sessionId"] })
  .index("IDX2", "byUpdatedAt", { pk: [] })
  .build();
