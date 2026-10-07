import { localBackend } from '../backends/local/index.ts';

/**
 * The Local Backend's code, already in the bundle: a phone ships all of its
 * code in the app, so there is no chunk worth splitting off, and Metro can
 * fetch a lazily imported chunk only from its development server. A
 * production bundle that imported it lazily would wait on it forever.
 */
export const loadLocalBackend = async (): Promise<typeof localBackend> =>
  localBackend;
