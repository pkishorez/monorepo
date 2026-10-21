import type { SlashCommand } from '@anthropic-ai/claude-agent-sdk';
import type { Skill } from '../../../harness/index.js';

/**
 * Claude Code's slash commands as Skills: the ones a user, project, plugin or
 * MCP server defines. Claude Code's own commands are left out: most of them
 * (`/clear`, `/model`, `/config`) drive its terminal, not the agent, and the
 * SDK cannot tell those from the few that are prompts.
 */
export const toSkills = (
  commands: ReadonlyArray<SlashCommand>,
): ReadonlyArray<Skill> => {
  const skills = new Map<string, Skill>();
  for (const command of commands) {
    if (command.builtin === true || skills.has(command.name)) continue;
    skills.set(command.name, {
      name: command.name,
      description: command.description,
      ...(command.argumentHint === ''
        ? {}
        : { argumentHint: command.argumentHint }),
    });
  }
  return [...skills.values()];
};
