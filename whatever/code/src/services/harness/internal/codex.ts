import { EventType, chat, type StreamChunk } from '@tanstack/ai';
import { SESSION_ID_EVENT, codexText } from '@tanstack/ai-codex';
import { sandboxMiddlewareFor } from '../sandbox.js';
import type { HarnessRunInputFor } from './run-input.js';

export const codexChat = (
  input: HarnessRunInputFor<'Codex'>,
  abortController: AbortController,
): AsyncIterable<StreamChunk> =>
  chat({
    adapter: codexText(input.configuration.model),
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

export const codexSessionIdFrom = (chunk: StreamChunk): string | null => {
  if (chunk.type !== EventType.CUSTOM || chunk.name !== SESSION_ID_EVENT) {
    return null;
  }
  const value = chunk.value as { sessionId?: unknown };
  return typeof value?.sessionId === 'string' ? value.sessionId : null;
};
