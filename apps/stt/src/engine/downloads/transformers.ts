/**
 * Lets Transformers.js fetch and cache model files through the downloader,
 * so its files are resumable and kept in the same store as every other.
 */
import { Effect, Option, Stream } from 'effect';
import { download, readDownload, type DownloadState } from './downloads.ts';

/**
 * Only model files come in pieces. Other hosts, such as the CDN serving the
 * ONNX runtime, answer ranges of a compressed body, which cannot be joined.
 */
export const isModelFile = (url: string): boolean =>
  new URL(url).hostname === 'huggingface.co';

/** Told each state of each model file Transformers.js pulls. */
export type FileProgress = (url: string, state: DownloadState) => void;

const asResponse = (file: Blob): Response =>
  new Response(file, {
    headers: {
      'Content-Length': String(file.size),
      'Content-Type': file.type || 'application/octet-stream',
    },
  });

/** Downloads one file, telling `report` each state; resolves to the file. */
const downloadReporting = (url: string, report: FileProgress) =>
  download(url).pipe(
    Stream.tap((state) => Effect.sync(() => report(url, state))),
    Stream.runLast,
    Effect.flatMap((last) => {
      const file = Option.isSome(last) ? last.value.file : null;
      return file
        ? Effect.succeed(file)
        : Effect.die(new Error(`${url} finished without a file.`));
    }),
  );

/**
 * Whole model files go through the downloader, so they land in its store;
 * other files and the one-byte range probes Transformers.js makes to size
 * files go straight out.
 */
export const fetchThroughDownloads =
  (report: FileProgress, signal: AbortSignal) =>
  async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const probing =
      (init?.method ?? 'GET') !== 'GET' ||
      new Headers(init?.headers).has('Range');
    const url = input instanceof Request ? input.url : String(input);
    if (probing || !isModelFile(url)) return fetch(input, { ...init, signal });
    return asResponse(
      await Effect.runPromise(downloadReporting(url, report), { signal }),
    );
  };

/** Answers Transformers.js's cache lookups from the downloader's store. */
export const downloadsCache = {
  match: async (key: string | Request): Promise<Response | undefined> => {
    const url = typeof key === 'string' ? key : key.url;
    if (!isModelFile(url)) return undefined;
    return Effect.runPromise(
      readDownload(url).pipe(
        Effect.map((file) => (file ? asResponse(file) : undefined)),
        Effect.orElseSucceed(() => undefined),
      ),
    );
  },
  // The downloader stored the file already while fetching it.
  put: async (): Promise<void> => {},
};
