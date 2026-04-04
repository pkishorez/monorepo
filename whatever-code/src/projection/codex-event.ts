import type { EntityType } from "@std-toolkit/core";
import type { ServerNotification } from "../agents/codex/generated/ServerNotification.js";

export type ProjectedCodexEvent =
  | { type: "userMessage"; id: string; text: string; images: string[] }
  | { type: "agentMessage"; id: string; text: string };

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
