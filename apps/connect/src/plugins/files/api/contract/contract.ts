import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/rpc';
import { ESchema } from '@kestack/std-toolkit/eschema';
import { publicPath } from '../../../../cloud/contract/index.js';
import { FILE_KINDS } from './kinds.js';

/*
 * The files Plugin's API, which any App speaks, over WebSocket: one call,
 * `requestFile`, which gives a File Ticket to a file on the Connection, or
 * says why it cannot. It knows nothing of Sessions: the App says which
 * folder a path is read from.
 *
 * A File Ticket is a URL in the Plugin's Public Area,
 * `/files/public/<token>/<filename>`, served to whoever holds it without the
 * Connection Key, until an hour after it was given however much it is used.
 * It names the file as it was when given; a Plugin update ends every one,
 * and the App asks again on a 404.
 *
 * Every value it sends is an ESchema, as the code Plugin's are, so an App
 * reads a Connection that lags behind it.
 */

/** The Plugin's name: where a Connection serves it, `/files/…`. */
export const FILES_PLUGIN = 'files';

/** How long a File Ticket lasts once given, in milliseconds: an hour. */
export const FILE_TICKET_LIFETIME_MS = 60 * 60 * 1000;

/**
 * Where a Connection serves the File Ticket `token`, after its address:
 * `/files/public/<token>/<filename>`. The token alone names the file; the
 * filename, URL-encoded, is for the browser, which shows and saves it by
 * that name. A `\`, which no Public Area path may carry even encoded, is
 * sent as `_`.
 */
export const ticketPath = (token: string, name: string) =>
  publicPath(
    FILES_PLUGIN,
    `${token}/${encodeURIComponent(name.replaceAll('\\', '_') || 'file')}`,
  );

/** What `requestFile` asks: `path`, absolute or relative to the folder `base`. */
export const RequestFilePayload = ESchema.make('RequestFilePayload', {
  /** The folder a relative `path` is read from, absolute. */
  base: Schema.String,
  path: Schema.String,
}).build();
export type RequestFilePayload = typeof RequestFilePayload.Type;

/** A File Ticket, and the file it names as it was when given. */
export const FileTicket = ESchema.make('FileTicket', {
  /** The file, absolute, its symlinks resolved. */
  path: Schema.String,
  /** Its name, the last segment of `path`. */
  name: Schema.String,
  kind: Schema.Literals(FILE_KINDS),
  /** The MIME type it is sent with, from its extension alone. */
  mime: Schema.String,
  /** Its size in bytes. */
  size: Schema.Int,
  /** Where it is served, after the Connection's address: `/files/public/<token>/<filename>` (`ticketPath`). */
  url: Schema.String,
  /** When the ticket ends, in epoch milliseconds. */
  expiresAt: Schema.Int,
}).build();
export type FileTicket = typeof FileTicket.Type;

/* Why a file has no ticket, each with the path asked for, resolved. */

/** Nothing is at the path. */
export class FileMissing extends Schema.TaggedError<FileMissing>()(
  'FileMissing',
  { path: Schema.String },
) {}

/** What is at the path is not a file: a folder, a socket, or such. */
export class NotAFile extends Schema.TaggedError<NotAFile>()('NotAFile', {
  path: Schema.String,
}) {}

/** The Plugin does not show files with this extension: lowercase, without its dot, empty for none. */
export class UnsupportedFile extends Schema.TaggedError<UnsupportedFile>()(
  'UnsupportedFile',
  { path: Schema.String, extension: Schema.String },
) {}

/** The file could not be read: this user may not, or an I/O error. */
export class FileUnreadable extends Schema.TaggedError<FileUnreadable>()(
  'FileUnreadable',
  { path: Schema.String, message: Schema.String },
) {}

/** Every reason `requestFile` fails with. */
export const RequestFileError = Schema.Union([
  FileMissing,
  NotAFile,
  UnsupportedFile,
  FileUnreadable,
]);
export type RequestFileError = typeof RequestFileError.Type;

export class FilesApi extends RpcGroup.make(
  /**
   * A File Ticket to the file at `path`, read from `base` when relative,
   * its symlinks followed; or why there is none.
   */
  Rpc.make('requestFile', {
    payload: RequestFilePayload.schema,
    success: FileTicket.schema,
    error: RequestFileError,
  }),
) {}
