import { parentOf } from '../../../../../../server/rpc/contract/index.js';

export function nameOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

export function ancestorsOf(path: string): ReadonlyArray<string> {
  const folders: Array<string> = [];
  let at = path;
  while (at !== '') {
    at = parentOf(at);
    folders.push(at);
  }
  return folders;
}
