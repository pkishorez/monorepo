export type { ServerNotification } from "../../codex/generated/ServerNotification.js";
export type { ServerRequest } from "../../codex/generated/ServerRequest.js";
export type { TokenUsage } from "../../codex/generated/TokenUsage.js";
export type { TurnStatus } from "../../codex/generated/v2/TurnStatus.js";
export type { TurnError } from "../../codex/generated/v2/TurnError.js";
export type { Thread } from "../../codex/generated/v2/Thread.js";
export type { Turn } from "../../codex/generated/v2/Turn.js";
export type { ThreadItem } from "../../codex/generated/v2/ThreadItem.js";
export type { ThreadStartParams } from "../../codex/generated/v2/ThreadStartParams.js";
export type { TurnStartParams } from "../../codex/generated/v2/TurnStartParams.js";
export type { ThreadResumeParams } from "../../codex/generated/v2/ThreadResumeParams.js";
export type { AskForApproval } from "../../codex/generated/v2/AskForApproval.js";
export type { SandboxMode } from "../../codex/generated/v2/SandboxMode.js";
export type { RequestId } from "../../codex/generated/RequestId.js";

import type { ServerNotification } from "../../codex/generated/ServerNotification.js";

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
