import type { QuestionItem } from '../entity/turn/turn.js';

type ToolStatus = 'pending' | 'success' | 'error';

/**
 * Normalized, presentation-ready tool call shared across agents.
 * Producers (Claude frontend normalizer + Codex backend projection) compute
 * everything the UI needs; the renderer switches on `kind` exhaustively.
 */
export type ProjectedToolCall =
  | {
      kind: 'file-edit';
      status: ToolStatus;
      filePath: string;
      additions: number;
      deletions: number;
      body:
        | { source: 'patch'; patch: string }
        | { source: 'strings'; oldContent: string; newContent: string };
    }
  | {
      kind: 'file-write';
      status: ToolStatus;
      filePath: string;
      content: string;
      additions: number;
      body?: { source: 'patch'; patch: string };
    }
  | { kind: 'bash'; status: ToolStatus; command: string }
  | { kind: 'read'; status: ToolStatus; filePath: string; limit?: number }
  | { kind: 'grep'; status: ToolStatus; pattern: string }
  | { kind: 'glob'; status: ToolStatus; pattern: string }
  | { kind: 'web-search'; status: ToolStatus; query: string }
  | { kind: 'web-fetch'; status: ToolStatus }
  | { kind: 'prompt'; status: ToolStatus; prompt: string }
  | {
      kind: 'generic';
      status: ToolStatus;
      name: string;
      input: Record<string, unknown>;
    };

export type ProjectedCodexEvent =
  | { type: 'userMessage'; id: string; text: string; images: string[] }
  | { type: 'agentMessage'; id: string; text: string }
  | {
      type: 'question';
      id: string;
      toolUseId: string;
      questions: Array<typeof QuestionItem.Type>;
    }
  | { type: 'tool'; id: string; call: ProjectedToolCall }
  | {
      type: 'subagent';
      id: string;
      name: string;
      status: ToolStatus;
      description: string;
    }
  | { type: 'plan'; id: string; text: string };
