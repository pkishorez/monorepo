import { Schema } from 'effect';

/** A file could not be fetched or kept, after retries. */
export class DownloadError extends Schema.TaggedError<DownloadError>()(
  'DownloadError',
  { url: Schema.String, message: Schema.String },
) {}

export const failedFor =
  (url: string) =>
  (cause: unknown): DownloadError =>
    new DownloadError({
      url,
      message: cause instanceof Error ? cause.message : String(cause),
    });
