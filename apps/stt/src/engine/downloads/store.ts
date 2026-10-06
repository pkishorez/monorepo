/**
 * Downloaded files and the pieces of unfinished ones, kept in one Cache
 * Storage bucket so they survive reloads. A whole file sits under its own
 * URL; a piece sits under a made-up key naming the file and its byte range.
 */
import { Effect } from 'effect';
import { failedFor, type DownloadError } from './error.ts';
import type { Piece } from './pieces.ts';

const storeName = 'stt-downloads';
const pieceKeyBase = 'https://pieces.stt.invalid/';

/** Runs one Cache Storage call; its failure names the file it was about. */
const inStore = <A>(
  url: string,
  run: (cache: Cache) => Promise<A>,
): Effect.Effect<A, DownloadError> =>
  Effect.tryPromise({
    try: async () => run(await caches.open(storeName)),
    catch: failedFor(url),
  });

const pieceKey = (url: string, size: number, piece: Piece): string =>
  `${pieceKeyBase}?${new URLSearchParams({
    url,
    size: String(size),
    start: String(piece.start),
    end: String(piece.end),
  })}`;

/** The pieces of `url` stored for a file of `size` bytes, read from their keys. */
const piecesIn = (
  keys: ReadonlyArray<Request>,
  url: string,
): ReadonlyArray<{ readonly size: number; readonly piece: Piece }> =>
  keys.flatMap((request) => {
    if (!request.url.startsWith(pieceKeyBase)) return [];
    const params = new URL(request.url).searchParams;
    if (params.get('url') !== url) return [];
    return [
      {
        size: Number(params.get('size')),
        piece: {
          start: Number(params.get('start')),
          end: Number(params.get('end')),
        },
      },
    ];
  });

export const readFile = (url: string) =>
  inStore(url, async (cache) => (await cache.match(url))?.blob() ?? null);

/** Bytes of the whole file if stored, from its header, without reading it. */
export const storedFileSize = (url: string) =>
  inStore(url, async (cache) => {
    const response = await cache.match(url);
    if (!response) return null;
    await response.body?.cancel();
    return Number(response.headers.get('content-length')) || 0;
  });

export const writeFile = (url: string, file: Blob) =>
  inStore(url, (cache) =>
    cache.put(
      url,
      new Response(file, { headers: { 'Content-Length': String(file.size) } }),
    ),
  );

export const readPiece = (url: string, size: number, piece: Piece) =>
  inStore(
    url,
    async (cache) =>
      (await cache.match(pieceKey(url, size, piece)))?.blob() ?? null,
  );

export const writePiece = (
  url: string,
  size: number,
  piece: Piece,
  bytes: Blob,
) =>
  inStore(url, (cache) =>
    cache.put(pieceKey(url, size, piece), new Response(bytes)),
  );

/** The pieces kept of a file of `size` bytes; pieces of another size are stale. */
export const storedPieces = (url: string, size: number) =>
  inStore(url, async (cache) =>
    piecesIn(await cache.keys(), url)
      .filter((entry) => entry.size === size)
      .map((entry) => entry.piece),
  );

/** Bytes held in pieces of the file, whatever size it was cut for. */
export const storedPieceBytes = (url: string) =>
  inStore(url, async (cache) =>
    piecesIn(await cache.keys(), url).reduce(
      (sum, { piece }) => sum + piece.end - piece.start + 1,
      0,
    ),
  );

export const deletePieces = (url: string) =>
  inStore(url, async (cache) => {
    for (const request of await cache.keys()) {
      if (piecesIn([request], url).length > 0) await cache.delete(request);
    }
  });

export const deleteFile = (url: string) =>
  inStore(url, (cache) => cache.delete(url)).pipe(
    Effect.andThen(deletePieces(url)),
  );
