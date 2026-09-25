/**
 * Model files fetched once and kept in the browser. A file comes down in
 * pieces, one after another, each kept as it lands, so a reload resumes
 * from the last kept piece. Knows nothing about what the files are.
 */
import { Effect, Stream } from 'effect';
import { DownloadError } from './error.ts';
import {
  bytesOf,
  fetchBytes,
  probeSize,
  splitIntoPieces,
  type Piece,
} from './pieces.ts';
import {
  deleteFile,
  deletePieces,
  readFile,
  readPiece,
  storedFileSize,
  storedPieceBytes,
  storedPieces,
  writeFile,
  writePiece,
} from './store.ts';

export { DownloadError };

/**
 * A piece is kept only once it has fully arrived, and a reload kills the
 * worker without warning, so this is how much a reload can lose: a few
 * seconds on a slow connection.
 */
const pieceBytes = 4 * 1_048_576;

/** A download's progress; the last state carries the finished file. */
export interface DownloadState {
  /** Bytes held: kept before this download began, plus fetched since. */
  readonly loaded: number;
  readonly total: number;
  /** Bytes that came over the network in this download, for its speed. */
  readonly fetched: number;
  readonly file: Blob | null;
}

/** Joins the kept pieces into the file, stores it and drops the pieces. */
const assemble = (url: string, size: number, pieces: ReadonlyArray<Piece>) =>
  Effect.gen(function* () {
    const parts: Array<Blob> = [];
    for (const piece of pieces) {
      const part = yield* readPiece(url, size, piece);
      if (part === null) {
        return yield* new DownloadError({
          url,
          message: 'A piece went missing.',
        });
      }
      parts.push(part);
    }
    yield* writeFile(url, new Blob(parts));
    yield* deletePieces(url);
    const file = yield* readFile(url);
    if (file === null) {
      return yield* new DownloadError({
        url,
        message: 'The file was not kept.',
      });
    }
    return file;
  });

/** The whole file in one request, for servers that ignore ranges; no resume. */
const downloadWhole = (
  url: string,
): Stream.Stream<DownloadState, DownloadError> =>
  Stream.suspend(() => {
    const chunks: Array<Uint8Array<ArrayBuffer>> = [];
    let fetched = 0;
    return Stream.concat(
      fetchBytes(url, null).pipe(
        Stream.map((chunk): DownloadState => {
          chunks.push(chunk);
          fetched += chunk.byteLength;
          return { loaded: fetched, total: fetched, fetched, file: null };
        }),
      ),
      Stream.fromEffect(
        Effect.suspend(() => {
          const file = new Blob(chunks);
          return writeFile(url, file).pipe(
            Effect.as<DownloadState>({
              loaded: file.size,
              total: file.size,
              fetched,
              file,
            }),
          );
        }),
      ),
    );
  });

/**
 * The file as a stream of progress states: straight from the store when
 * whole there, otherwise the pieces not yet kept are fetched in order and
 * the file is joined from them. The first state already counts kept pieces.
 */
export const download = (
  url: string,
): Stream.Stream<DownloadState, DownloadError> =>
  Stream.unwrap(
    Effect.gen(function* () {
      const stored = yield* readFile(url);
      if (stored) {
        return Stream.make<[DownloadState]>({
          loaded: stored.size,
          total: stored.size,
          fetched: 0,
          file: stored,
        });
      }

      const size = yield* probeSize(url);
      if (size === null) return downloadWhole(url);

      const pieces = splitIntoPieces(size, pieceBytes);
      const kept = new Set(
        (yield* storedPieces(url, size)).map((piece) => piece.start),
      );
      const missing = pieces.filter((piece) => !kept.has(piece.start));
      let held = pieces
        .filter((piece) => kept.has(piece.start))
        .reduce((sum, piece) => sum + bytesOf(piece), 0);
      let fetched = 0;
      const now = (inFlight: number): DownloadState => ({
        loaded: held + inFlight,
        total: size,
        fetched,
        file: null,
      });

      const fetchPiece = (piece: Piece) =>
        Stream.suspend(() => {
          const chunks: Array<Uint8Array<ArrayBuffer>> = [];
          let received = 0;
          return Stream.concat(
            fetchBytes(url, piece).pipe(
              Stream.map((chunk) => {
                chunks.push(chunk);
                received += chunk.byteLength;
                fetched += chunk.byteLength;
                return now(received);
              }),
            ),
            Stream.fromEffect(
              Effect.suspend(() =>
                writePiece(url, size, piece, new Blob(chunks)).pipe(
                  Effect.map(() => {
                    held += received;
                    return now(0);
                  }),
                ),
              ),
            ),
          );
        });

      return Stream.concat(
        Stream.make(now(0)),
        Stream.concat(
          Stream.fromIterable(missing).pipe(
            Stream.flatMap(fetchPiece, { concurrency: 1 }),
          ),
          Stream.fromEffect(
            assemble(url, size, pieces).pipe(
              Effect.map((file): DownloadState => ({
                loaded: size,
                total: size,
                fetched,
                file,
              })),
            ),
          ),
        ),
      );
    }),
  );

/** The stored file, or null when it has not finished downloading. */
export const readDownload = (
  url: string,
): Effect.Effect<Blob | null, DownloadError> => readFile(url);

/**
 * How much of the files the browser holds: none, some, or every file whole,
 * and the bytes held counting kept pieces of unfinished files.
 */
export const readDownloads = (
  urls: ReadonlyArray<string>,
): Effect.Effect<
  {
    readonly state: 'none' | 'partial' | 'downloaded';
    readonly bytes: number;
  },
  DownloadError
> =>
  Effect.gen(function* () {
    let whole = 0;
    let bytes = 0;
    for (const url of urls) {
      const size = yield* storedFileSize(url);
      if (size !== null) {
        whole += 1;
        bytes += size;
      } else {
        bytes += yield* storedPieceBytes(url);
      }
    }
    const state =
      whole === urls.length ? 'downloaded' : bytes > 0 ? 'partial' : 'none';
    return { state, bytes };
  });

/** Deletes the files and any kept pieces of them. */
export const clearDownloads = (
  urls: ReadonlyArray<string>,
): Effect.Effect<void, DownloadError> =>
  Effect.forEach(urls, deleteFile, { discard: true });
