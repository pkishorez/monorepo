import type { StreamChunk } from '@tanstack/ai';

export type RunEvent =
  | { _tag: 'started'; threadId: string; runId: string }
  | { _tag: 'chunk'; chunk: StreamChunk };
