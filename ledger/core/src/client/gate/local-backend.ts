import type { localBackend } from '../backends/local/index.ts';

/**
 * The Local Backend's code, loaded the first time someone chooses it: on the
 * web it is a chunk of its own, so those on the Remote Backend never fetch
 * it. A phone loads `local-backend.native.ts` instead.
 */
export const loadLocalBackend = async (): Promise<typeof localBackend> =>
  (await import('../backends/local/index.ts')).localBackend;
