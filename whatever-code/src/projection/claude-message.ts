import type { EntityType } from "@std-toolkit/core";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";

export type ProjectedClaudeMessage =
  | { type: "user"; text: string; images: string[] }
  | { type: "assistant"; text: string };

interface ClaudeMessageValue {
  id: string;
  sessionId: string;
  turnId: string;
  data: SDKMessage;
}

interface ProjectedClaudeMessageValue {
  id: string;
  sessionId: string;
  turnId: string;
  data: ProjectedClaudeMessage;
}

function extractImageSrc(block: Record<string, unknown>): string | null {
  if (
    "source" in block &&
    typeof block.source === "object" &&
    block.source !== null &&
    "data" in block.source &&
    typeof block.source.data === "string" &&
    "media_type" in block.source &&
    typeof block.source.media_type === "string"
  ) {
    return `data:${block.source.media_type};base64,${block.source.data}`;
  }
  if ("url" in block && typeof block.url === "string") return block.url;
  if ("image_url" in block && typeof block.image_url === "string")
    return block.image_url;
  return null;
}

function extractTextAndImages(content: unknown): {
  text: string;
  images: string[];
} {
  if (typeof content === "string") return { text: content, images: [] };
  if (!Array.isArray(content)) return { text: "", images: [] };

  let text = "";
  const images: string[] = [];
  for (const block of content) {
    if (block?.type === "text" && typeof block.text === "string") {
      text += block.text;
    } else if (block?.type === "image") {
      const src = extractImageSrc(block);
      if (src) images.push(src);
    }
  }
  return { text, images };
}

export function projectClaudeMessage(
  entity: EntityType<ClaudeMessageValue>,
): EntityType<ProjectedClaudeMessageValue> | null {
  const raw = entity.value.data;
  if (!raw || typeof raw !== "object") return null;

  if (raw.type === "user") {
    if (typeof raw.parent_tool_use_id === "string") return null;
    const { text, images } = extractTextAndImages(raw.message?.content);
    if (!text && images.length === 0) return null;
    return {
      ...entity,
      value: {
        id: entity.value.id,
        sessionId: entity.value.sessionId,
        turnId: entity.value.turnId,
        data: { type: "user", text, images },
      },
    };
  }

  if (raw.type === "assistant") {
    const { text } = extractTextAndImages(raw.message?.content);
    if (!text) return null;
    return {
      ...entity,
      value: {
        id: entity.value.id,
        sessionId: entity.value.sessionId,
        turnId: entity.value.turnId,
        data: { type: "assistant", text },
      },
    };
  }

  return null;
}
