import { fileURLToPath } from 'node:url';
import { makeSkillsCommand } from 'laymos/skills-command';

// Two levels below the package root from both `src/cli/` and `dist/server/`.
const SKILLS_ROOT = fileURLToPath(new URL('../../skills/', import.meta.url));

export const skillsCommand = makeSkillsCommand({
  skillsRoot: SKILLS_ROOT,
  names: ['devtools'],
  cliName: 'kstack',
});
