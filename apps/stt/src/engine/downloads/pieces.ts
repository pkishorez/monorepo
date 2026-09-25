import { Effect, Stream } from 'effect';
import { DownloadError, failedFor } from './error.ts';

/** One byte range of a file, inclusive at both ends as HTTP counts them. */
export interface Piece {
  readonly start: number;
  readonly end: number;
}

export const bytesOf = (piece: Piece): number => piece.end - piece.start + 1;

/** Cuts `size` bytes into ranges of `pieceBytes`; the last one takes the rest. */
export const splitIntoPieces = (
  size: number,
  pieceBytes: number,
): ReadonlyArray<Piece> => {
  const pieces: Array<Piece> = [];
  for (let start = 0; start < size; start += pieceBytes) {
    pieces.push({ start, end: Math.min(start + pieceBytes, size) - 1 });
  }
  return pieces;
};

/**
 * Asks for the first byte to learn the file's size. Null when the server
 * ignores ranges, so the file cannot be fetched in pieces.
 */
export const probeSize = (url: string) =>
  Effect.tryPromise({
    try: async () => {
      const response = await fetch(url, {
        headers: { Range: 'bytes=0-0' },
        cache: 'no-store',
      });
      await response.body?.cancel();
      if (response.status !== 206) return null;
      const total = /\/(\d+)$/.exec(
        response.headers.get('content-range') ?? '',
      );
      return total ? Number(total[1]) : null;
    },
    catch: failedFor(url),
  });

/**
 * Streams the bytes of one range, or of the whole file when `piece` is null.
 * Each chunk comes out as it arrives, so the caller can count and keep it.
 */
export const fetchBytes = (
  url: string,
  piece: Piece | null,
): Stream.Stream<Uint8Array<ArrayBuffer>, DownloadError> =>
  Stream.unwrap(
    Effect.tryPromise({
      try: () =>
        fetch(url, {
          headers: piece
            ? { Range: `bytes=${piece.start}-${piece.end}` }
            : undefined,
          cache: 'no-store',
        }),
      catch: failedFor(url),
    }).pipe(
      Effect.flatMap((response) =>
        response.status === (piece ? 206 : 200) && response.body
          ? Effect.succeed(
              Stream.fromReadableStream({
                evaluate: () => response.body!,
                onError: failedFor(url),
              }),
            )
          : Effect.fail(
              new DownloadError({ url, message: `HTTP ${response.status}` }),
            ),
      ),
    ),
  );
