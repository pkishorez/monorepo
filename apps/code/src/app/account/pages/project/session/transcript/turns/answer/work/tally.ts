import type { ToolKind } from '@kestack/connect/code';
import type { Row } from '../../rows/index.ts';

/*
 * A run of work in a sentence a person reads: "Read 3 files, changed 2
 * files and ran one command", three things at most and "and 2 more" after;
 * the kinds of tool it used, for their icons; and what it is doing now,
 * while it runs.
 */

const plural = (n: number, one: string, many: string) =>
  n === 1 ? `one ${one}` : `${n} ${many}`;

const join = (parts: ReadonlyArray<string>) => {
  const shown =
    parts.length > 3
      ? [...parts.slice(0, 3), `${parts.length - 3} more`]
      : parts;
  return shown.length <= 1
    ? (shown[0] ?? '')
    : `${shown.slice(0, -1).join(', ')} and ${shown.at(-1)}`;
};

export const tally = (rows: ReadonlyArray<Row>): string => {
  const tools = rows.flatMap((row) =>
    row.kind === 'tool' ? [row.call.tool] : [],
  );
  const count = (...kinds: ReadonlyArray<ToolKind>) =>
    tools.filter((tool) => kinds.includes(tool)).length;
  const subagents = rows.filter((row) => row.kind === 'subagent').length;
  const parts = [
    count('read') > 0 && `read ${plural(count('read'), 'file', 'files')}`,
    count('search') > 0 &&
      `searched ${count('search') === 1 ? 'once' : `${count('search')} times`}`,
    subagents > 0 && `asked ${plural(subagents, 'subagent', 'subagents')}`,
    count('edit', 'write', 'delete') > 0 &&
      `changed ${plural(count('edit', 'write', 'delete'), 'file', 'files')}`,
    count('bash') > 0 && `ran ${plural(count('bash'), 'command', 'commands')}`,
    count('web') > 0 && `read ${plural(count('web'), 'page', 'pages')}`,
    count('mcp', 'other') > 0 &&
      `used ${plural(count('mcp', 'other'), 'tool', 'tools')}`,
    count('todo') > 0 && 'updated its list',
  ].filter((part): part is string => typeof part === 'string');
  const said =
    parts.length > 0
      ? join(parts)
      : rows.some((row) => row.kind === 'reasoning')
        ? 'thought it through'
        : 'worked';
  return said.charAt(0).toUpperCase() + said.slice(1);
};

/** The kinds of tool a run used, first used first, for their icons. */
export const kindsOf = (rows: ReadonlyArray<Row>): ReadonlyArray<ToolKind> => [
  ...new Set(
    rows.flatMap((row): ToolKind[] =>
      row.kind === 'tool'
        ? [row.call.tool]
        : row.kind === 'subagent'
          ? ['subagent']
          : [],
    ),
  ),
];
