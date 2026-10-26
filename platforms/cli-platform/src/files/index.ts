export {
  createFolders,
  FolderError,
  folders,
  pluginFolders,
  socketPath,
} from './folders/index.js';
export type { Folders, PluginFolders } from './folders/index.js';
export {
  CacheError,
  DownloadFailed,
  Downloads,
  HashMismatch,
} from './downloads/index.js';
export type { Download, Made, Progress } from './downloads/index.js';
