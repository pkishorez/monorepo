import { Authz } from 'auth-toolkit/rpc';
import { Credentials } from '../../rpc/credentials/index.ts';
import { Stores } from '../../rpc/stores/index.ts';
import { Explorer } from '../../rpc/explorer/index.ts';
import { Deletion } from '../../rpc/deletion/index.ts';

export const ConsoleApi = Authz.guard()(
  Credentials.merge(Stores, Explorer, Deletion),
);
