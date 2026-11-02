/*
 * `@kestack/connect/files`: what an App imports to show files from its
 * Connections. The files Plugin's API, the kinds it shows, File Embeds,
 * and the client that reaches it on each Connection. The Link of each
 * socket, `linking`, `linked` or `relinking`, is read with
 * `FilesClients.link`, as `./code`'s.
 */

export {
  embedPath,
  extensionOf,
  FILE_EMBED_SCHEME,
  FILE_EXTENSIONS,
  FILE_KINDS,
  FILE_TICKET_LIFETIME_MS,
  FILE_TYPES,
  FileMissing,
  FILES_PLUGIN,
  FilesApi,
  FileTicket,
  fileTypeOf,
  FileUnreadable,
  NotAFile,
  RequestFileError,
  RequestFilePayload,
  ticketPath,
  UnsupportedFile,
  type FileKind,
  type FileType,
} from './contract/index.js';
export {
  FilesAddress,
  FilesClient,
  FilesClients,
  ticketUrlAt,
  type FilesConnectionClient,
} from './client/index.js';
