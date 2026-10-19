import { Auth } from '@kestack/auth-toolkit';
import { Connections } from './connections/index.ts';
import { Credentials } from './credentials/index.ts';
import { Repositories } from './repositories/index.ts';
import { Session } from './session/index.ts';

/**
 * Everything a signed-in user's tabs ask their User Space, as one Effect RPC
 * group: every call runs only for a known caller.
 *
 * A later group joins by merging into it, each a nested module like
 * `session/`: `Auth.required(Session.merge(Credentials, Projects))`. The
 * User Space serves every group it holds; nothing else changes.
 */
export const ConsoleApi = Auth.required(
  Session.merge(Credentials, Connections, Repositories),
);
