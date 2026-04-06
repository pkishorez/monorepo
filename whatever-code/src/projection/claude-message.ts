import type { EntityType } from "@std-toolkit/core";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { BetaContentBlock } from "@anthropic-ai/sdk/resources/beta/messages/messages.mjs";
import type { ContentBlockParam } from "@anthropic-ai/sdk/resources";

export type ProjectedClaudeMessage =
  | { type: "user"; text: string; images: string[] }
  | {
      type: "assistant";
      text: string;
      toolCalls: Array<{ id: string; name: string; input: unknown }>;
    }
  | {
      type: "tool_result";
      results: Array<{ toolUseId: string; isError: boolean }>;
    };

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
  parentToolUseId: string | null;
  data: ProjectedClaudeMessage;
}

function extractAssistantText(content: BetaContentBlock[]): string {
  let text = "";
  for (const block of content) {
    if (block.type === "text") {
      text += block.text;
    }
  }
  return text;
}

function extractToolCalls(
  content: BetaContentBlock[],
): Array<{ id: string; name: string; input: unknown }> {
  const calls: Array<{
    id: string;
    name: string;
    input: unknown;
  }> = [];
  for (const block of content) {
    if (block.type === "tool_use") {
      calls.push({ id: block.id, name: block.name, input: block.input });
    }
  }
  return calls;
}

function extractUserTextAndImages(content: string | ContentBlockParam[]): {
  text: string;
  images: string[];
} {
  if (typeof content === "string") return { text: content, images: [] };
  let text = "";
  const images: string[] = [];
  for (const block of content) {
    if (block.type === "text") {
      text += block.text;
    } else if (block.type === "image") {
      const source = block.source;
      if (source.type === "base64") {
        images.push(`data:${source.media_type};base64,${source.data}`);
      } else if ("url" in source) {
        images.push(source.url);
      }
    }
  }
  return { text, images };
}

function extractToolResults(
  content: string | ContentBlockParam[],
): Array<{ toolUseId: string; isError: boolean }> | null {
  if (typeof content === "string") return null;
  const results: Array<{ toolUseId: string; isError: boolean }> = [];
  for (const block of content) {
    if (block.type === "tool_result") {
      results.push({
        toolUseId: block.tool_use_id,
        isError: block.is_error === true,
      });
    }
  }
  return results.length > 0 ? results : null;
}

export function projectClaudeMessage(
  entity: EntityType<ClaudeMessageValue>,
): EntityType<ProjectedClaudeMessageValue> | null {
  const raw = entity.value.data;
  if (!raw || typeof raw !== "object") return null;

  const wrap = (
    parentToolUseId: string | null,
    data: ProjectedClaudeMessage,
  ): EntityType<ProjectedClaudeMessageValue> => ({
    ...entity,
    value: {
      id: entity.value.id,
      sessionId: entity.value.sessionId,
      turnId: entity.value.turnId,
      parentToolUseId,
      data,
    },
  });

  if (raw.type === "user") {
    const content = raw.message?.content;
    if (!content) return null;
    const parentToolUseId = raw.parent_tool_use_id ?? null;

    const toolResults = extractToolResults(content);
    if (toolResults) {
      return wrap(parentToolUseId, { type: "tool_result", results: toolResults });
    }

    const { text, images } = extractUserTextAndImages(content);
    if (!text && images.length === 0) return null;
    return wrap(parentToolUseId, { type: "user", text, images });
  }

  if (raw.type === "assistant") {
    const content = raw.message?.content;
    if (!content) return null;
    const parentToolUseId = raw.parent_tool_use_id ?? null;

    const text = extractAssistantText(content);
    const toolCalls = extractToolCalls(content);
    if (!text && toolCalls.length === 0) return null;
    return wrap(parentToolUseId, { type: "assistant", text, toolCalls });
  }

  return null;
}
