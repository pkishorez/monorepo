import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export const DEFAULT_ENTRY_ID = 'virtual:pwa-toolkit/default-entry';

export const DEFAULT_ENTRY_SOURCE = `import { runServiceWorker } from '@kstackz/web-toolkit/pwa/worker';
runServiceWorker();
`;

const APP_ENTRY = 'src/sw.ts';

/**
 * The worker entry: the `worker` option, else the app's `src/sw.ts`, else the
 * built-in entry. A configured entry that does not exist is an error.
 */
export const resolveWorkerEntry = (
  root: string,
  worker: string | null,
): string => {
  if (worker !== null) {
    const path = resolve(root, worker);
    if (!existsSync(path)) {
      throw new Error(`pwa-toolkit: worker entry not found: ${path}`);
    }
    return path;
  }
  const app = resolve(root, APP_ENTRY);
  return existsSync(app) ? app : DEFAULT_ENTRY_ID;
};
