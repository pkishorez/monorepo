// What the Project picker asks: the saved Projects, listed, added by
// folder and removed by id, and the folders under home it walks to find
// one.
export {
  ProjectEntrySchema,
  ProjectRegistryError,
  ProjectsRpc,
} from './projects-rpc.js';
export type { ProjectEntry } from './projects-rpc.js';
export { FolderError, FolderListingSchema, FolderSchema } from './folders.js';
export type { Folder, FolderListing } from './folders.js';
