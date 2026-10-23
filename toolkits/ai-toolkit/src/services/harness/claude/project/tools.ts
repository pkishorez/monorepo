import type { ToolKind } from '../../../records/projection/index.js';

const KINDS: Readonly<Record<string, ToolKind>> = {
  Read: 'read',
  Write: 'write',
  Edit: 'edit',
  MultiEdit: 'edit',
  NotebookEdit: 'edit',
  Bash: 'bash',
  Grep: 'search',
  Glob: 'search',
  LS: 'search',
  WebFetch: 'web',
  WebSearch: 'web',
  web_search: 'web',
  web_fetch: 'web',
  Task: 'subagent',
  Agent: 'subagent',
  TodoWrite: 'todo',
};

export const toolKind = (name: string): ToolKind =>
  KINDS[name] ?? (name.startsWith('mcp__') ? 'mcp' : 'other');

const TITLE_MAX = 120;

const field = (input: unknown, key: string): string | undefined => {
  if (typeof input !== 'object' || input === null) return undefined;
  const value = (input as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
};

const oneLine = (text: string): string => {
  const line = text.trim().split('\n')[0] ?? '';
  return line.length > TITLE_MAX ? `${line.slice(0, TITLE_MAX - 1)}…` : line;
};

const titleFrom = (name: string, input: unknown): string | undefined => {
  switch (toolKind(name)) {
    case 'read':
    case 'write':
    case 'edit':
      return field(input, 'file_path') ?? field(input, 'notebook_path');
    case 'bash':
      return field(input, 'command');
    case 'search': {
      const pattern = field(input, 'pattern');
      const path = field(input, 'path');
      if (pattern === undefined) return path;
      return path === undefined ? pattern : `${pattern} in ${path}`;
    }
    case 'web':
      return field(input, 'url') ?? field(input, 'query');
    case 'subagent':
      return field(input, 'description') ?? field(input, 'subagent_type');
    case 'todo':
      return 'Update todos';
    case 'mcp': {
      const [, server, tool] = name.split('__');
      return server === undefined ? undefined : `${server}: ${tool ?? ''}`;
    }
    default:
      return field(input, 'description');
  }
};

/** One line a person reads for a tool call: a path, a command, a pattern. */
export const toolTitle = (name: string, input: unknown): string =>
  oneLine(titleFrom(name, input) ?? name);
