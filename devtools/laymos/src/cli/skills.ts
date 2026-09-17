import { fileURLToPath } from 'node:url';
import { makeSkillsCommand } from '../skills-command/index.js';

// Two levels below the package root from both `src/cli/` and `dist/cli/`.
const SKILLS_ROOT = fileURLToPath(new URL('../../skills/', import.meta.url));

export const skillsCommand = makeSkillsCommand({
  skillsRoot: SKILLS_ROOT,
  names: ['laymos', 'to-laymos', 'domain-modeling', 'deep-module'],
  cliName: 'laymos',
});
