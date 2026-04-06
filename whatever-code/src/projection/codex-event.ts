import type { EntityType } from "@std-toolkit/core";
import type { ServerNotification } from "../agents/codex/generated/ServerNotification.js";

type ToolStatus = "pending" | "success" | "error";

export type ProjectedCodexEvent =
  | { type: "userMessage"; id: string; text: string; images: string[] }
  | { type: "agentMessage"; id: string; text: string }
  | {
      type: "tool";
      id: string;
      name: string;
      status: ToolStatus;
      input: Record<string, string>;
    }
  | {
      type: "subagent";
      id: string;
      name: string;
      status: ToolStatus;
      description: string;
    };

interface CodexEventValue {
  id: string;
  sessionId: string;
  turnId: string;
  data: ServerNotification;
}

interface ProjectedCodexEventValue {
  id: string;
  sessionId: string;
  turnId: string;
  data: ProjectedCodexEvent;
}

function mapStatus(s: unknown): ToolStatus {
  if (s === "completed") return "success";
  if (s === "failed" || s === "declined") return "error";
  return "pending";
}

export function projectCodexEvent(
  entity: EntityType<CodexEventValue>,
): EntityType<ProjectedCodexEventValue> | null {
  const raw = entity.value.data;
  if (!raw || typeof raw !== "object") return null;

  const method = raw.method;
  if (method !== "item/started" && method !== "item/completed") return null;

  const item = (raw as { params?: { item?: Record<string, any> } }).params
    ?.item;
  if (!item) return null;

  let projected: ProjectedCodexEvent | null = null;

  if (item.type === "userMessage" && method === "item/started") {
    let text = "";
    const images: string[] = [];
    for (const c of item.content ?? []) {
      if (c.type === "text" && typeof c.text === "string") text += c.text;
      else if (c.type === "image" && typeof c.url === "string")
        images.push(c.url);
    }
    projected = { type: "userMessage", id: item.id, text, images };
  } else if (item.type === "agentMessage") {
    projected = { type: "agentMessage", id: item.id, text: item.text ?? "" };
  } else if (item.type === "commandExecution") {
    projected = {
      type: "tool",
      id: item.id,
      name: "Bash",
      status: mapStatus(item.status),
      input: { command: item.command ?? "" },
    };
  } else if (item.type === "fileChange") {
    const paths = (item.changes ?? []).map(
      (c: { path?: string }) => c.path ?? "",
    );
    projected = {
      type: "tool",
      id: item.id,
      name: "Edit",
      status: mapStatus(item.status),
      input: { file_path: paths.join(", ") },
    };
  } else if (item.type === "mcpToolCall") {
    projected = {
      type: "tool",
      id: item.id,
      name: item.tool ?? "mcp",
      status: mapStatus(item.status),
      input: {},
    };
  } else if (item.type === "dynamicToolCall") {
    projected = {
      type: "tool",
      id: item.id,
      name: item.tool ?? "tool",
      status: mapStatus(item.status),
      input: {},
    };
  } else if (item.type === "webSearch") {
    projected = {
      type: "tool",
      id: item.id,
      name: "WebSearch",
      status: "success",
      input: { query: item.query ?? "" },
    };
  } else if (item.type === "collabAgentToolCall") {
    const prompt = item.prompt ?? "";
    projected = {
      type: "subagent",
      id: item.id,
      name: item.tool ?? "agent",
      status: mapStatus(item.status),
      description: prompt.length > 80 ? prompt.slice(0, 80) + "…" : prompt,
    };
  }

  if (!projected) return null;

  return {
    ...entity,
    value: {
      id: entity.value.id,
      sessionId: entity.value.sessionId,
      turnId: entity.value.turnId,
      data: projected,
    },
  };
}
