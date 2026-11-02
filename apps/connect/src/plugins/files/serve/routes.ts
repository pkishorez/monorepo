import { constants } from 'node:fs';
import { type FileHandle, open } from 'node:fs/promises';
import { Effect, Exit } from 'effect';
import { HttpRouter, HttpServerRequest, HttpServerResponse } from 'effect/http';
import { ticketPath } from '../api/contract/index.js';
import { type Ticket, Tickets } from './tickets.js';

/*
 * The Public Area's one route, `GET /<token>/<filename>`, which answers at
 * `/public/…`: the file a File Ticket names, to whoever holds it. A token
 * that names no ticket, one that has ended, a filename that is not the
 * ticket's, or a file that is no longer the one it was given for (another
 * device or inode, or a symlink in its place) all answer the same 404. One
 * `Range` is answered 206, one past the end 416, and none 200; HEAD is
 * answered as GET, without the body. Every answer to a ticket is sent with
 * its MIME type and nothing for the browser to guess, no referrer, and
 * `private, no-cache` with an ETag and Last-Modified: a browser may keep
 * it but asks before it reuses it, and an `If-None-Match` naming the file
 * as it is now is answered 304, so a file written again is sent again. HTML
 * and SVG run sandboxed with no same-origin, so their scripts and styles
 * load from anywhere but they never call the Connection. Code reads
 * markdown with `fetch` from its own origin. The answer lets any origin
 * read it, but only a page on the Connection's list of origins gets this
 * far: its guard refuses a `fetch` from any other, a sandboxed page's
 * `null` among them, before it reaches the Plugin.
 */

const NOT_FOUND = HttpServerResponse.empty({ status: 404 });

/** The sandbox HTML and SVG run in: no `allow-same-origin`, so their origin is opaque. */
export const SANDBOX =
  'sandbox allow-scripts allow-popups allow-forms allow-modals allow-downloads';

/** Opened without following a symlink, where the platform can. */
const READ = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0);

/** The bytes a request asks for, first and last inclusive; `unsatisfiable` when none of them are in the file. */
export type Range =
  | { readonly start: number; readonly end: number }
  | 'unsatisfiable';

/**
 * The one range a `Range` header asks of a file of `size` bytes:
 * `bytes=a-b`, `bytes=a-` or `bytes=-n`. Undefined when it asks none, or
 * several, or is not one, so the whole file is sent.
 */
export const rangeOf = (
  header: string | undefined,
  size: number,
): Range | undefined => {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header?.trim() ?? '');
  if (match === null) return undefined;
  const [, first = '', last = ''] = match;
  if (first === '' && last === '') return undefined;
  if (first === '') {
    const suffix = Number(last);
    return suffix === 0 || size === 0
      ? 'unsatisfiable'
      : { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(first);
  if (last !== '' && Number(last) < start) return undefined;
  if (start >= size) return 'unsatisfiable';
  return {
    start,
    end: last === '' ? size - 1 : Math.min(Number(last), size - 1),
  };
};

/** `name` as a `Content-Disposition` gives it: ASCII for every browser, and UTF-8 (RFC 5987) for those that read it. */
export const dispositionOf = (name: string) => {
  const ascii = name.replace(/[^\x20-\x7e]|["\\%]/g, '_');
  const utf8 = encodeURIComponent(name).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `inline; filename="${ascii}"; filename*=UTF-8''${utf8}`;
};

/** Which version of a file an answer is: its ETag and Last-Modified. */
export interface Version {
  readonly etag: string;
  readonly lastModified: string;
}

/** The version of a file with these stats: its device, inode, size and last change. */
export const versionOf = (stats: {
  readonly dev: number;
  readonly ino: number;
  readonly size: number;
  readonly mtimeMs: number;
}): Version => {
  const parts = [
    stats.dev,
    stats.ino,
    stats.size,
    Math.round(stats.mtimeMs * 1000),
  ];
  return {
    etag: `"${parts.map((part) => part.toString(36)).join('-')}"`,
    lastModified: new Date(stats.mtimeMs).toUTCString(),
  };
};

/** Whether an `If-None-Match` header names `etag`, compared weakly, or is `*`. */
export const matches = (header: string | undefined, etag: string) =>
  header !== undefined &&
  header
    .split(',')
    .map((each) => each.trim().replace(/^W\//, ''))
    .some((each) => each === '*' || each === etag);

/** What every answer to `ticket` is sent with, for its file at `version`. */
export const headersOf = (ticket: Ticket, version: Version) => ({
  'content-type': ticket.mime,
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'accept-ranges': 'bytes',
  'content-disposition': dispositionOf(ticket.name),
  'cache-control': 'private, no-cache',
  etag: version.etag,
  'last-modified': version.lastModified,
  'access-control-allow-origin': '*',
  ...(ticket.kind === 'html' || ticket.mime.startsWith('image/svg+xml')
    ? { 'content-security-policy': SANDBOX }
    : {}),
});

/** The file a ticket names, open: its handle, size and version. */
interface Opened {
  readonly handle: FileHandle;
  readonly size: number;
  readonly version: Version;
}

/** The file `ticket` names, opened; undefined when it is gone or is another file now. */
const openTicket = (ticket: Ticket) =>
  Effect.promise(async (): Promise<Opened | undefined> => {
    let handle: FileHandle;
    try {
      handle = await open(ticket.realPath, READ);
    } catch {
      return undefined;
    }
    try {
      const stats = await handle.stat();
      if (
        stats.isFile() &&
        stats.dev === ticket.dev &&
        stats.ino === ticket.ino
      )
        return { handle, size: stats.size, version: versionOf(stats) };
    } catch {
      // Answered as a file that is gone.
    }
    await handle.close().catch(() => undefined);
    return undefined;
  });

/** The ticket `token` names, if `filename` is its name. */
const ticketFor = (token: string, filename: string) =>
  Effect.gen(function* () {
    const ticket = yield* (yield* Tickets).take(token);
    return ticket !== undefined &&
      ticketPath(token, filename) === ticketPath(token, ticket.name)
      ? ticket
      : undefined;
  });

/** An answer, and whether its body took the file's handle, to close once it is sent. */
interface Answer {
  readonly response: HttpServerResponse.HttpServerResponse;
  readonly streams: boolean;
}

/** The answer to `request` with `file`, the one `ticket` names. */
const answerOf = (
  request: HttpServerRequest.HttpServerRequest,
  ticket: Ticket,
  file: Opened,
): Answer => {
  const headers = headersOf(ticket, file.version);
  const empty = (status: number, more = {}): Answer => ({
    response: HttpServerResponse.empty({
      status,
      headers: { ...headers, ...more },
    }),
    streams: false,
  });
  if (matches(request.headers['if-none-match'], file.version.etag))
    return empty(304);
  const body = (
    status: number,
    start: number,
    length: number,
    more = {},
  ): Answer => {
    const sent = { ...more, 'content-length': String(length) };
    if (request.method === 'HEAD' || length === 0) return empty(status, sent);
    return {
      response: HttpServerResponse.raw(
        file.handle.createReadStream({
          start,
          end: start + length - 1,
          autoClose: true,
        }),
        { status, headers: { ...headers, ...sent } },
      ),
      streams: true,
    };
  };
  const range = rangeOf(request.headers.range, file.size);
  if (range === undefined) return body(200, 0, file.size);
  if (range === 'unsatisfiable')
    return empty(416, { 'content-range': `bytes */${file.size}` });
  return body(206, range.start, range.end - range.start + 1, {
    'content-range': `bytes ${range.start}-${range.end}/${file.size}`,
  });
};

/**
 * The file a ticket names. Its handle is closed here unless the answer's
 * body took it: for an answer without a body, and when the handler fails
 * or is interrupted before the answer is made. A body that took it closes
 * it once it is sent.
 */
const serveTicket = Effect.gen(function* () {
  const params = yield* HttpRouter.params;
  const ticket = yield* ticketFor(params.token ?? '', params['*'] ?? '');
  if (ticket === undefined) return NOT_FOUND;
  const request = yield* HttpServerRequest.HttpServerRequest;
  const answer = yield* Effect.acquireUseRelease(
    openTicket(ticket),
    (file) =>
      Effect.sync((): Answer =>
        file === undefined
          ? { response: NOT_FOUND, streams: false }
          : answerOf(request, ticket, file),
      ),
    (file, exit) =>
      file === undefined || (Exit.isSuccess(exit) && exit.value.streams)
        ? Effect.void
        : Effect.promise(() => file.handle.close().catch(() => undefined)),
  );
  return answer.response;
});

/** The Public Area's routes: each File Ticket's file. */
export const publicRoutes = [
  HttpRouter.route('GET', '/:token/*', serveTicket),
] as const;
