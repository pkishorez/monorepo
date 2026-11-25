import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname } from 'node:path';

/*
 * Sends a file a Video's `files` names, whole or the byte Range asked for,
 * so a video seeks without being read from the start.
 */

export type Range =
  | { readonly _tag: 'Whole' }
  | { readonly _tag: 'Part'; readonly start: number; readonly end: number }
  | { readonly _tag: 'Unsatisfiable' };

/**
 * The one Range a `Range: bytes=…` header asks of a file of `size` bytes,
 * its end inclusive. A header that is missing, malformed or asks for
 * several ranges is answered whole, as HTTP allows.
 */
export const rangeOf = (header: string | undefined, size: number): Range => {
  const match = header?.trim().match(/^bytes=(\d*)-(\d*)$/);
  if (!match) return { _tag: 'Whole' };
  const [, from = '', to = ''] = match;
  if (from === '' && to === '') return { _tag: 'Whole' };
  if (from === '') {
    const suffix = Number(to);
    if (suffix === 0 || size === 0) return { _tag: 'Unsatisfiable' };
    return { _tag: 'Part', start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(from);
  if (start >= size) return { _tag: 'Unsatisfiable' };
  const end = to === '' ? size - 1 : Math.min(Number(to), size - 1);
  if (end < start) return { _tag: 'Whole' };
  return { _tag: 'Part', start, end };
};

const TYPES: Readonly<Record<string, string>> = {
  '.mp4': 'video/mp4',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

/** Answers the file at `path`, or `false` if there is none. */
export const sendFile = async (
  request: IncomingMessage,
  response: ServerResponse,
  path: string,
): Promise<boolean> => {
  const found = await stat(path).catch(() => null);
  if (!found?.isFile()) return false;
  const size = found.size;
  const range = rangeOf(request.headers.range, size);
  response.setHeader(
    'Content-Type',
    TYPES[extname(path)] ?? 'application/octet-stream',
  );
  response.setHeader('Accept-Ranges', 'bytes');
  response.setHeader('Cache-Control', 'no-cache');
  response.setHeader('Last-Modified', found.mtime.toUTCString());
  if (range._tag === 'Unsatisfiable') {
    response.writeHead(416, { 'Content-Range': `bytes */${size}` }).end();
    return true;
  }
  const { start, end } =
    range._tag === 'Part' ? range : { start: 0, end: size - 1 };
  if (range._tag === 'Part') {
    response.statusCode = 206;
    response.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
  }
  response.setHeader('Content-Length', size === 0 ? 0 : end - start + 1);
  if (request.method === 'HEAD' || size === 0) {
    response.end();
    return true;
  }
  const stream = createReadStream(path, { start, end });
  response.once('close', () => stream.destroy());
  stream.once('error', () => response.destroy());
  stream.pipe(response);
  return true;
};
