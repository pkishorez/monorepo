import { homedir } from 'node:os';
import { resolve } from 'node:path';

import { FoldersRpc } from '../../contract/index.js';
import { listFolders } from './folders.js';

/** Fulfils the folder RPC, walking from `home` down (the user's home by default). */
export const foldersRpcLayer = (home: string = homedir()) =>
  FoldersRpc.toLayer({
    ListFolders: (input) => listFolders(resolve(home), input),
  });
