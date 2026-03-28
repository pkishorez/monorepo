import { EntityESchema } from "@std-toolkit/eschema";
import { Schema } from "effect";
import { SDKMessage, SDKResultMessage } from "./types.js";
import { Typed } from "../../lib/typed.js";
import { SDKSystemMessage } from "@anthropic-ai/claude-agent-sdk";
import { TaskStatus } from "../status.js";

export interface PendingQuestionOption {
  label: string;
  description: string;
  preview?: string;
}

export interface PendingQuestionItem {
  question: string;
  header: string;
  options: PendingQuestionOption[];
  multiSelect: boolean;
}

export interface PendingQuestion {
  toolUseId: string;
  questions: PendingQuestionItem[];
}

export const claudeTurnEntity = EntityESchema.make("claudeTurn", "id", {
  sessionId: Schema.String,
  status: TaskStatus,
  init: Schema.NullOr(Typed<SDKSystemMessage>()),
  result: Schema.NullOr(Typed<SDKResultMessage>()),
  planArtifact: Schema.NullOr(Schema.String),
  pendingQuestion: Schema.NullOr(Typed<PendingQuestion>()),
}).build();

export const claudeMessageEntity = EntityESchema.make("claudeMessage", "id", {
  sessionId: Schema.String,
  turnId: Schema.String,
  data: Typed<SDKMessage>(),
}).build();
