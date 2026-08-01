import { EventType, chat, type StreamChunk } from '@tanstack/ai';
import { SESSION_ID_EVENT, claudeCodeText } from '@tanstack/ai-claude-code';
import { sandboxMiddlewareFor } from '../sandbox.js';
import type { HarnessRunInputFor } from './run-input.js';

export const claudeCodeChat = (
  input: HarnessRunInputFor<'ClaudeCode'>,
  abortController: AbortController,
): AsyncIterable<StreamChunk> =>
  chat({
    adapter: claudeCodeText(input.configuration.model),
    messages: [input.message],
    middleware: [sandboxMiddlewareFor(input.workingDirectory)],
    abortController,
    threadId: input.threadId,
    runId: input.runId,
    modelOptions: {
      ...input.configuration.modelOptions,
      ...(input.sessionId !== null ? { sessionId: input.sessionId } : {}),
    },
  });

export const claudeCodeSessionIdFrom = (chunk: StreamChunk): string | null => {
  if (chunk.type !== EventType.CUSTOM || chunk.name !== SESSION_ID_EVENT) {
    return null;
  }
  const value = chunk.value as { sessionId?: unknown };
  return typeof value?.sessionId === 'string' ? value.sessionId : null;
};
