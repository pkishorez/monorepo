import { homedir } from 'node:os';
import { join } from 'node:path';
import type { ConfigFolderInfo, HarnessName } from '../../contract/index.js';
import { expand } from './executable.js';

/*
 * The config folder a Harness Account really runs with. An account with a
 * folder of its own sets it as `CLAUDE_CONFIG_DIR` or `CODEX_HOME`; one
 * without runs in this process's environment, so a variable set there is
 * the folder it uses; with neither, the harness's own, under home. What
 * runs does not change: this only says where it is.
 */

/** Each harness's variable for it, and its own folder under home. */
const FOLDER: Record<HarnessName, { variable: string; own: string }> = {
  claude: { variable: 'CLAUDE_CONFIG_DIR', own: '.claude' },
  codex: { variable: 'CODEX_HOME', own: '.codex' },
};

/** Where `harness`, run with `configFolder` or none, keeps its config, and why there. */
export const configFolderOf = (
  harness: HarnessName,
  configFolder: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
  home: string = homedir(),
): ConfigFolderInfo => {
  if (configFolder !== undefined)
    return { path: expand(configFolder), from: 'account' };
  const { variable, own } = FOLDER[harness];
  const set = env[variable]?.trim();
  return set !== undefined && set !== ''
    ? { path: expand(set), from: 'environment', variable }
    : { path: join(home, own), from: 'default' };
};
