import { win32 } from 'node:path';

/*
 * Where Windows keeps a program's files: config roams with the user in
 * %APPDATA%, and the rest stays on this computer in %LOCALAPPDATA%. A
 * missing variable falls back to the folder it names by default.
 */

/** The four base folders, under `kestack`. */
export const windowsFolders = (
  env: Readonly<Record<string, string | undefined>>,
  home: string,
) => {
  const roaming = env['APPDATA'] || win32.join(home, 'AppData', 'Roaming');
  const local = env['LOCALAPPDATA'] || win32.join(home, 'AppData', 'Local');
  return {
    config: win32.join(roaming, 'kestack'),
    data: win32.join(local, 'kestack'),
    state: win32.join(local, 'kestack', 'state'),
    cache: win32.join(local, 'kestack', 'cache'),
  };
};
