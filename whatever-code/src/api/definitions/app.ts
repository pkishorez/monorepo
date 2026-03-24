import { Rpc, RpcGroup } from "@effect/rpc";
import { BroadcastSchema, EntitySchema } from "@std-toolkit/core";
import { Schema } from "effect";
import { projectEntity } from "../../entity/project/index.js";

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
).prefix("app.") {}
