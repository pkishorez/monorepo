export type { ServerNotification } from "../../agents/codex/generated/ServerNotification.js";
export type { ServerRequest } from "../../agents/codex/generated/ServerRequest.js";
export type { TokenUsage } from "../../agents/codex/generated/TokenUsage.js";
export type { TurnStatus } from "../../agents/codex/generated/v2/TurnStatus.js";
export type { TurnError } from "../../agents/codex/generated/v2/TurnError.js";
export type { Thread } from "../../agents/codex/generated/v2/Thread.js";
export type { Turn } from "../../agents/codex/generated/v2/Turn.js";
export type { ThreadItem } from "../../agents/codex/generated/v2/ThreadItem.js";
export type { ThreadStartParams } from "../../agents/codex/generated/v2/ThreadStartParams.js";
export type { TurnStartParams } from "../../agents/codex/generated/v2/TurnStartParams.js";
export type { ThreadResumeParams } from "../../agents/codex/generated/v2/ThreadResumeParams.js";
export type { AskForApproval } from "../../agents/codex/generated/v2/AskForApproval.js";
export type { SandboxMode } from "../../agents/codex/generated/v2/SandboxMode.js";
export type { RequestId } from "../../agents/codex/generated/RequestId.js";

import type { ServerNotification } from "../../agents/codex/generated/ServerNotification.js";

export const PERSISTED_NOTIFICATION_METHODS = [
  "item/started",
  "item/completed",
  "turn/diff/updated",
  "turn/plan/updated",
  "error",
] as const;

export const PERSISTED_METHODS = new Set<string>(PERSISTED_NOTIFICATION_METHODS);

export type PersistedNotificationMethod =
  (typeof PERSISTED_NOTIFICATION_METHODS)[number];

export type PersistedNotification = Extract<
  ServerNotification,
  { method: PersistedNotificationMethod }
>;
