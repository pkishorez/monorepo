import { Schema } from "effect";
import { MetaSchema } from "../schema.js";

// ─── COMMON SCHEMAS ───────────────────────────────────────────────────────────

export const CommandTimingSchema = Schema.Struct({
  startedAt: Schema.Number,
  completedAt: Schema.Number,
  durationMs: Schema.Number,
});

export const EntityTypeSchema = <T extends Schema.Schema.Any>(valueSchema: T) =>
  Schema.Struct({
    value: valueSchema,
    meta: MetaSchema,
  });

// ─── PAYLOAD SCHEMAS (INPUTS) ─────────────────────────────────────────────────

export const InsertPayloadSchema = Schema.Struct({
  operation: Schema.Literal("insert"),
  entity: Schema.String,
  data: Schema.Record({ key: Schema.String, value: Schema.Unknown }),
});

export const UpdatePayloadSchema = Schema.Struct({
  operation: Schema.Literal("update"),
  entity: Schema.String,
  key: Schema.Record({ key: Schema.String, value: Schema.Unknown }),
  data: Schema.Record({ key: Schema.String, value: Schema.Unknown }),
});

export const DeletePayloadSchema = Schema.Struct({
  operation: Schema.Literal("delete"),
  entity: Schema.String,
  key: Schema.Record({ key: Schema.String, value: Schema.Unknown }),
});

export const SkConditionSchema = Schema.Union(
  Schema.Struct({ "<": Schema.NullOr(Schema.String) }),
  Schema.Struct({ "<=": Schema.NullOr(Schema.String) }),
  Schema.Struct({ ">": Schema.NullOr(Schema.String) }),
  Schema.Struct({ ">=": Schema.NullOr(Schema.String) }),
);

export const QueryPayloadSchema = Schema.Struct({
  operation: Schema.Literal("query"),
  entity: Schema.String,
  index: Schema.String,
  pk: Schema.Record({ key: Schema.String, value: Schema.Unknown }),
  sk: SkConditionSchema,
  limit: Schema.optional(Schema.Number),
});

export const DescriptorPayloadSchema = Schema.Struct({
  operation: Schema.Literal("descriptor"),
});

export const CommandPayloadSchema = Schema.Union(
  InsertPayloadSchema,
  UpdatePayloadSchema,
  DeletePayloadSchema,
  QueryPayloadSchema,
  DescriptorPayloadSchema,
);

// ─── DESCRIPTOR SCHEMAS ───────────────────────────────────────────────────────

export const IndexPatternDescriptorSchema = Schema.Struct({
  deps: Schema.Array(Schema.String),
  pattern: Schema.String,
});

export const IndexDescriptorSchema = Schema.Struct({
  name: Schema.String,
  pk: IndexPatternDescriptorSchema,
  sk: IndexPatternDescriptorSchema,
});

export const StdDescriptorSchema = Schema.Struct({
  name: Schema.String,
  version: Schema.String,
  primaryIndex: IndexDescriptorSchema,
  timelineIndex: Schema.optional(IndexDescriptorSchema),
  secondaryIndexes: Schema.Array(IndexDescriptorSchema),
  schema: Schema.Unknown,
});

// ─── RESPONSE SCHEMAS (OUTPUTS) ───────────────────────────────────────────────

const EntityDataSchema = EntityTypeSchema(Schema.Unknown);

export const InsertResponseSchema = Schema.Struct({
  operation: Schema.Literal("insert"),
  entity: Schema.String,
  timing: CommandTimingSchema,
  data: EntityDataSchema,
});

export const UpdateResponseSchema = Schema.Struct({
  operation: Schema.Literal("update"),
  entity: Schema.String,
  timing: CommandTimingSchema,
  data: EntityDataSchema,
});

export const DeleteResponseSchema = Schema.Struct({
  operation: Schema.Literal("delete"),
  entity: Schema.String,
  timing: CommandTimingSchema,
  data: EntityDataSchema,
});

export const QueryResponseSchema = Schema.Struct({
  operation: Schema.Literal("query"),
  entity: Schema.String,
  timing: CommandTimingSchema,
  items: Schema.Array(EntityDataSchema),
});

export const DescriptorResponseSchema = Schema.Struct({
  operation: Schema.Literal("descriptor"),
  timing: CommandTimingSchema,
  descriptors: Schema.Array(StdDescriptorSchema),
});

export const CommandResponseSchema = Schema.Union(
  InsertResponseSchema,
  UpdateResponseSchema,
  DeleteResponseSchema,
  QueryResponseSchema,
  DescriptorResponseSchema,
);

// ─── ERROR SCHEMA ─────────────────────────────────────────────────────────────

export class CommandErrorSchema extends Schema.TaggedError<CommandErrorSchema>()(
  "CommandError",
  {
    operation: Schema.Literal("insert", "update", "delete", "query", "descriptor"),
    entity: Schema.String,
    message: Schema.String,
    cause: Schema.optional(Schema.Unknown),
  },
) {}

// ─── TYPE INFERENCE ───────────────────────────────────────────────────────────

export type CommandPayloadSchemaType = typeof CommandPayloadSchema.Type;
export type CommandResponseSchemaType = typeof CommandResponseSchema.Type;
