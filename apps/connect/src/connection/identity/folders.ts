import { createHash } from 'node:crypto';
import { rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Effect } from 'effect';
import { folders, names, socketPath } from '@kestack/cli-platform/files';

/*
 * Where each Connection keeps its files, as cli-platform lays them out for
 * the app `connect`: its data folder holds `connection.json` and
 * `connect.db`, the Sign-in, and each Plugin's data; its state folder holds
 * the logs; the cache is shared by every Connection; its sockets are in the
 * runtime folder, named by the first 8 characters of the sha256 of its
 * name, since names such as `worktree-agent-…` share their first ones.
 */

/** The control socket's name; no Plugin may take it. */
const CONTROL = 'connect';

/** Every file one Connection uses. */
export const connectionFolders = (name: string) =>
  Effect.try({
    try: () => {
      const own = folders({ app: 'connect', name });
      const socketId = createHash('sha256').update(name).digest('hex');
      return {
        ...own,
        name,
        socketId,
        connectionFile: join(own.data, 'connection.json'),
        db: join(own.data, 'connect.db'),
        log: join(own.state, 'connect.log'),
        /** The control socket, which the running Connection holds. */
        control: socketPath(own.runtime, socketId, CONTROL),
        /** The folder of its sockets; null where they are named pipes, in no folder. */
        sockets:
          process.platform === 'win32'
            ? null
            : dirname(socketPath(own.runtime, socketId, CONTROL)),
      };
    },
    catch: (error) =>
      error instanceof Error ? error : new Error(String(error)),
  });

export type ConnectionFolders = Effect.Success<
  ReturnType<typeof connectionFolders>
>;

/** The name of every Connection with a data folder on this computer. */
export const connectionNames = () => Effect.sync(() => names('connect'));

/** Deletes a Connection's data, its state and its sockets' folder. */
export const deleteFolders = (own: ConnectionFolders) =>
  Effect.sync(() => {
    for (const folder of [own.data, own.state, own.sockets])
      if (folder !== null) rmSync(folder, { recursive: true, force: true });
  });
