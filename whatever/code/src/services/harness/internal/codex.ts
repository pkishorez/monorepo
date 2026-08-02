import { EventType, chat, type StreamChunk } from '@tanstack/ai';
import { SESSION_ID_EVENT, codexText } from '@tanstack/ai-codex';
import { sandboxMiddlewareFor } from '../sandbox.js';
import { kishoreTools } from './kishore-tools.js';
import type { HarnessRunInputFor } from './run-input.js';

export const codexChat = (
  input: HarnessRunInputFor<'Codex'>,
  abortController: AbortController,
): AsyncIterable<StreamChunk> =>
  chat({
    // Codex requires interactive approval for MCP tool calls (kishoreTools,
    // below) regardless of `approvalPolicy` — under `codex exec` there's no
    // TTY to answer that prompt, so the call auto-cancels. This flag is the
    // only thing that skips it. It also disables codex's own `--sandbox`,
    // but the outer TanStack sandbox (`sandboxMiddlewareFor`) is the real
    // isolation boundary here anyway.
    adapter: codexText(input.configuration.model, {
      codexExecutable: 'codex --dangerously-bypass-approvals-and-sandbox',
    }),
    messages: [input.message],
    middleware: [sandboxMiddlewareFor(input.workingDirectory)],
    tools: kishoreTools,
    abortController,
    threadId: input.threadId,
    runId: input.runId,
    modelOptions: {
      ...input.configuration.modelOptions,
      ...(input.sessionId !== null ? { sessionId: input.sessionId } : {}),
    },
  });

export const codexSessionIdFrom = (chunk: StreamChunk): string | null => {
  if (chunk.type !== EventType.CUSTOM || chunk.name !== SESSION_ID_EVENT) {
    return null;
  }
  const value = chunk.value as { sessionId?: unknown };
  return typeof value?.sessionId === 'string' ? value.sessionId : null;
};
