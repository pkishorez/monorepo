import { Rpc, RpcGroup } from "@effect/rpc";
import { BroadcastSchema, EntitySchema } from "@std-toolkit/core";
import { Schema } from "effect";
import { projectEntity } from "../../core/entity/project/index.js";
import { sessionEntity } from "../../core/entity/session/index.js";
import { turnEntity } from "../../core/entity/turn/index.js";

export const OpenProjectParams = Schema.Struct({
  absolutePath: Schema.String,
});

export class AppError extends Schema.TaggedError<AppError>()("AppError", {
  message: Schema.String,
}) {}

export class AppRpcs extends RpcGroup.make(
  Rpc.make("subscribe", {
    success: BroadcastSchema,
    payload: Schema.Void,
    stream: true,
  }),
  Rpc.make("revealDataFolder", {
    success: Schema.Void,
    payload: Schema.Void,
  }),
  Rpc.make("openProject", {
    success: EntitySchema(projectEntity),
    error: AppError,
    payload: OpenProjectParams,
  }),
  Rpc.make("queryProjects", {
    success: Schema.Array(EntitySchema(projectEntity)),
    error: AppError,
    payload: Schema.Struct({ ">": Schema.NullOr(Schema.String) }),
  }),
  Rpc.make("discoverProjects", {
    success: Schema.Array(
      Schema.Struct({
        absolutePath: Schema.String,
        homePath: Schema.String,
        gitPath: Schema.String,
        sessionCount: Schema.Number,
      }),
    ),
    error: AppError,
    payload: Schema.Void,
  }),
  Rpc.make("getProjectFiles", {
    success: Schema.Array(Schema.String),
    error: AppError,
    payload: Schema.Struct({ absolutePath: Schema.String }),
  }),
  Rpc.make("querySessions", {
    success: Schema.Array(EntitySchema(sessionEntity)),
    error: AppError,
    payload: Schema.Struct({ ">": Schema.NullOr(Schema.String) }),
  }),
  Rpc.make("queryTurns", {
    success: Schema.Array(EntitySchema(turnEntity)),
    error: AppError,
    payload: Schema.Struct({ ">": Schema.NullOr(Schema.String) }),
  }),
).prefix("app.") {}
