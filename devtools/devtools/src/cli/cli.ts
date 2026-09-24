import { getFlowCommand, listFlowsCommand } from './flows/index.js';
import { skillsCommand } from './skills.js';
import { snapshotCommand } from './snapshot/index.js';
import { getTraceCommand, listTracesCommand } from './traces/index.js';

/** Every `devtools` subcommand, in the order help lists them. */
export const subcommands = [
  listTracesCommand,
  getTraceCommand,
  listFlowsCommand,
  getFlowCommand,
  skillsCommand,
  snapshotCommand,
] as const;
