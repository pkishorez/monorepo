import { SQLiteEntity } from "@std-toolkit/sqlite";
import { EntityESchema } from "@std-toolkit/eschema";
import { Schema } from "effect";
import { Typed } from "../../lib/typed.js";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { projectEntity } from "../../entity/project/index.js";
import { table } from "../table.js";

const claudeMessageEntity = EntityESchema.make("claudeMessage", "id", {
  sessionId: Schema.String,
  turnId: Schema.String,
  data: Typed<SDKMessage>(),
}).build();

export const claudeMessageSqliteEntity = SQLiteEntity.make(table)
  .eschema(claudeMessageEntity)
  .primary()
  .index("IDX1", "bySession", { pk: ["sessionId"] })
  .index("IDX2", "byUpdatedAt", { pk: [] })
  .build();

export const projectSqliteEntity = SQLiteEntity.make(table)
  .eschema(projectEntity)
  .primary()
  .index("IDX1", "byUpdatedAt", { pk: [] })
  .build();
