import { Authz } from '@kestack/auth-toolkit';
import { Credentials } from '../../rpc/credentials/index.ts';
import { Stores } from '../../rpc/stores/index.ts';
import { Explorer } from '../../rpc/explorer/index.ts';
import { Deletion } from '../../rpc/deletion/index.ts';

export const ConsoleApi = Authz.required(
  Credentials.merge(Stores, Explorer, Deletion),
);
