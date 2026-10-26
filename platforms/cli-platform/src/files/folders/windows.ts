import { win32 } from 'node:path';

/*
 * Where Windows keeps a program's files: on this computer, in
 * %LOCALAPPDATA%; a missing variable falls back to the folder it names by
 * default. Sockets are named pipes there, which live in no folder.
 */

/** The prefix every named pipe has; it stands for the runtime folder. */
export const PIPES = '\\\\.\\pipe\\';

/** The data, state and cache folders, under `kestack`. */
export const windowsFolders = (
  env: Readonly<Record<string, string | undefined>>,
  home: string,
) => {
  const local = env['LOCALAPPDATA'] || win32.join(home, 'AppData', 'Local');
  return {
    data: win32.join(local, 'kestack'),
    state: win32.join(local, 'kestack', 'state'),
    cache: win32.join(local, 'kestack', 'cache'),
  };
};
