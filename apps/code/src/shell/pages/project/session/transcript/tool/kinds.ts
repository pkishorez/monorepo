import type { ToolKind } from '@kestack/connect/code';
import { BotIcon } from '@kestack/web-platform/ui/components/lucide';
import { bash } from './kinds/bash/index.ts';
import { remove } from './kinds/delete/index.ts';
import { edit } from './kinds/edit/index.ts';
import { mcp } from './kinds/mcp/index.ts';
import { other } from './kinds/other/index.ts';
import { read } from './kinds/read/index.ts';
import { search } from './kinds/search/index.ts';
import { todo } from './kinds/todo/index.ts';
import { web } from './kinds/web/index.ts';
import { write } from './kinds/write/index.ts';
import type { Kind } from './output/index.ts';

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
  mcp,
  other,
  subagent: { ...other, icon: BotIcon },
};
