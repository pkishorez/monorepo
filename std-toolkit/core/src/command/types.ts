import { Effect } from "effect";
import {
  CommandTimingSchema,
  CommandPayloadSchema,
  CommandResponseSchema,
  CommandErrorSchema,
  InsertPayloadSchema,
  UpdatePayloadSchema,
  DeletePayloadSchema,
  QueryPayloadSchema,
  DescriptorPayloadSchema,
  InsertResponseSchema,
  UpdateResponseSchema,
  DeleteResponseSchema,
  QueryResponseSchema,
  DescriptorResponseSchema,
  SkConditionSchema,
  StdDescriptorSchema,
} from "./schema.js";

// ─── TYPES DERIVED FROM SCHEMAS ───────────────────────────────────────────────

export type CommandTiming = typeof CommandTimingSchema.Type;
export type InsertPayload = typeof InsertPayloadSchema.Type;
export type UpdatePayload = typeof UpdatePayloadSchema.Type;
export type DeletePayload = typeof DeletePayloadSchema.Type;
export type QueryPayload = typeof QueryPayloadSchema.Type;
export type DescriptorPayload = typeof DescriptorPayloadSchema.Type;
export type SkCondition = typeof SkConditionSchema.Type;
export type CommandPayload = typeof CommandPayloadSchema.Type;
export type InsertResponse = typeof InsertResponseSchema.Type;
export type UpdateResponse = typeof UpdateResponseSchema.Type;
export type DeleteResponse = typeof DeleteResponseSchema.Type;
export type QueryResponse = typeof QueryResponseSchema.Type;
export type DescriptorResponse = typeof DescriptorResponseSchema.Type;
export type CommandResponse = typeof CommandResponseSchema.Type;
export type StdDescriptor = typeof StdDescriptorSchema.Type;

export { CommandErrorSchema as CommandError } from "./schema.js";

// ─── INTERNAL INTERFACES ──────────────────────────────────────────────────────

export interface EntityType<T> {
  value: T;
  meta: {
    _v: string;
    _e: string;
    _d: boolean;
    _uid: string;
  };
}

export interface CommonResponse {
  entity: string;
  timing: CommandTiming;
}

// ─── COMMAND PROCESSOR INTERFACE ──────────────────────────────────────────────

export interface CommandProcessor<R = never> {
  process(payload: InsertPayload): Effect.Effect<InsertResponse, InstanceType<typeof CommandErrorSchema>, R>;
  process(payload: UpdatePayload): Effect.Effect<UpdateResponse, InstanceType<typeof CommandErrorSchema>, R>;
  process(payload: DeletePayload): Effect.Effect<DeleteResponse, InstanceType<typeof CommandErrorSchema>, R>;
  process(payload: QueryPayload): Effect.Effect<QueryResponse, InstanceType<typeof CommandErrorSchema>, R>;
  process(payload: DescriptorPayload): Effect.Effect<DescriptorResponse, InstanceType<typeof CommandErrorSchema>, R>;
  process(payload: CommandPayload): Effect.Effect<CommandResponse, InstanceType<typeof CommandErrorSchema>, R>;
}
