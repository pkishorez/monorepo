import { EventType, type StreamChunk } from '@tanstack/ai';
import type { RunConfigurationInput } from '../../domain/run/index.js';
import {
  claudeCodeSessionIdFrom,
  codexSessionIdFrom,
} from './internal/index.js';

export const sessionIdFrom = (
  harness: RunConfigurationInput['_tag'],
  chunk: StreamChunk,
): string | null =>
  harness === 'Codex'
    ? codexSessionIdFrom(chunk)
    : claudeCodeSessionIdFrom(chunk);

export const runErrorFrom = (
  chunk: StreamChunk,
): { code: string | null; message: string } | null =>
  chunk.type === EventType.RUN_ERROR
    ? { code: chunk.code ?? null, message: chunk.message || 'Run failed' }
    : null;
