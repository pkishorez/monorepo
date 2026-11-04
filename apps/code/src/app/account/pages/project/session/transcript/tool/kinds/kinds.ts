import type { ToolKind } from '@kestack/connect/code';
import { BotIcon } from 'lucide-react';
import type { Kind } from '../output/index.ts';
import { edit, read, remove, write } from './files.tsx';
import { mcp, other, question, todo, web } from './outside.tsx';
import { bash, search } from './shell.tsx';

/*
 * How each kind of tool call is drawn, grouped by what it works on: files
 * (`files.tsx`), the shell (`shell.tsx`), and what is past them
 * (`outside.tsx`).
 */

/** Every kind of tool, by what the harness called it. A subagent's own row is drawn elsewhere. */
export const KINDS: Record<ToolKind, Kind> = {
  read,
  write,
  edit,
  delete: remove,
  bash,
  search,
  web,
  todo,
  question,
  mcp,
  other,
  subagent: { ...other, icon: BotIcon },
};
