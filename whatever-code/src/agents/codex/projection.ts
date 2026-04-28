import type { EntityType } from '@std-toolkit/core';
import type { CodexEventSource } from './event-source.js';
import type { QuestionItem } from '../../core/entity/turn/turn.js';
import type { ProjectedCodexEvent } from '../../core/projection/codex-event.js';

type ToolStatus = 'pending' | 'success' | 'error';

interface CodexEventValue {
  id: string;
  sessionId: string;
  turnId: string;
  data: CodexEventSource;
}

interface ProjectedCodexEventValue {
  id: string;
  sessionId: string;
  turnId: string;
  data: ProjectedCodexEvent;
}

function mapStatus(s: unknown): ToolStatus {
  if (s === 'completed') return 'success';
  if (s === 'failed' || s === 'declined') return 'error';
  return 'pending';
}

function countDiffLines(diff: string): {
  additions: number;
  deletions: number;
} {
  let additions = 0;
  let deletions = 0;
  for (const line of diff.split('\n')) {
    if (line.startsWith('+') && !line.startsWith('+++')) additions++;
    else if (line.startsWith('-') && !line.startsWith('---')) deletions++;
  }
  return { additions, deletions };
}

/**
 * Codex emits bare unified hunks (starting with `@@`) without the `--- a/path`
 * / `+++ b/path` file headers that a unified-diff parser needs to split files.
 * Prepend headers when missing so downstream consumers can parse the patch.
 */
function ensureUnifiedDiffHeader(diff: string, filePath: string): string {
  if (diff.startsWith('--- ') || diff.startsWith('diff --git')) return diff;
  const path = filePath || 'file';
  return `--- a/${path}\n+++ b/${path}\n${diff}`;
}

export function projectCodexEvent(
  entity: EntityType<CodexEventValue>,
): EntityType<ProjectedCodexEventValue> | null {
  const raw = entity.value.data;
  if (!raw || typeof raw !== 'object') return null;

  const method = raw.method;
  if (method === 'item/tool/requestUserInput') {
    const params = (
      raw as {
        params?: { questions?: Array<typeof QuestionItem.Type> };
      }
    ).params;
    if (!params?.questions) return null;

    // toolUseId is set to the entity id (which is the server-generated
    // requestId) for frontend compatibility with Claude's question shape.
    return {
      ...entity,
      value: {
        id: entity.value.id,
        sessionId: entity.value.sessionId,
        turnId: entity.value.turnId,
        data: {
          type: 'question',
          id: entity.value.id,
          toolUseId: entity.value.id,
          questions: params.questions,
        },
      },
    };
  }

  if (method !== 'item/started' && method !== 'item/completed') return null;

  const item = (raw as { params?: { item?: Record<string, any> } }).params
    ?.item;
  if (!item) return null;

  let projected: ProjectedCodexEvent | null = null;

  if (item.type === 'userMessage' && method === 'item/started') {
    let text = '';
    const images: string[] = [];
    for (const c of item.content ?? []) {
      if (c.type === 'text' && typeof c.text === 'string') text += c.text;
      else if (c.type === 'image' && typeof c.url === 'string')
        images.push(c.url);
    }
    projected = { type: 'userMessage', id: item.id, text, images };
  } else if (item.type === 'agentMessage') {
    projected = { type: 'agentMessage', id: item.id, text: item.text ?? '' };
  } else if (item.type === 'commandExecution') {
    projected = {
      type: 'tool',
      id: item.id,
      call: {
        kind: 'bash',
        status: mapStatus(item.status),
        command: item.command ?? '',
      },
    };
  } else if (item.type === 'fileChange') {
    const changes = item.changes ?? [];
    const first = changes[0] as
      | { path?: string; diff?: string; kind?: { type: string } }
      | undefined;
    const filePath = first?.path ?? '';
    const diff = first?.diff ?? '';
    const status = mapStatus(item.status);
    if (first?.kind?.type === 'add') {
      const patch = ensureUnifiedDiffHeader(diff, filePath);
      projected = {
        type: 'tool',
        id: item.id,
        call: {
          kind: 'file-write',
          status,
          filePath,
          content: diff,
          additions: countDiffLines(diff).additions,
          body: {
            source: 'patch',
            patch,
          },
        },
      };
    } else {
      const { additions, deletions } = countDiffLines(diff);
      projected = {
        type: 'tool',
        id: item.id,
        call: {
          kind: 'file-edit',
          status,
          filePath,
          additions,
          deletions,
          body: {
            source: 'patch',
            patch: ensureUnifiedDiffHeader(diff, filePath),
          },
        },
      };
    }
  } else if (item.type === 'mcpToolCall') {
    projected = {
      type: 'tool',
      id: item.id,
      call: {
        kind: 'generic',
        status: mapStatus(item.status),
        name: item.tool ?? 'mcp',
        input: {},
      },
    };
  } else if (item.type === 'dynamicToolCall') {
    projected = {
      type: 'tool',
      id: item.id,
      call: {
        kind: 'generic',
        status: mapStatus(item.status),
        name: item.tool ?? 'tool',
        input: {},
      },
    };
  } else if (item.type === 'webSearch') {
    projected = {
      type: 'tool',
      id: item.id,
      call: {
        kind: 'web-search',
        status: 'success',
        query: item.query ?? '',
      },
    };
  } else if (item.type === 'collabAgentToolCall') {
    const prompt = item.prompt ?? '';
    projected = {
      type: 'subagent',
      id: item.id,
      name: item.tool ?? 'agent',
      status: mapStatus(item.status),
      description: prompt.length > 80 ? prompt.slice(0, 80) + '…' : prompt,
    };
  } else if (item.type === 'plan' && method === 'item/completed') {
    projected = { type: 'plan', id: item.id, text: item.text ?? '' };
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
