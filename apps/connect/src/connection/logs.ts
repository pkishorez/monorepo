import { appendFileSync, existsSync, statSync, truncateSync } from 'node:fs';
import { Effect, Layer, Logger } from 'effect';

/*
 * `serve` logs to the console and to a file, so a Connect started by a
 * dev script or in the background can still be read afterwards. The file
 * is only ever appended to; a file grown past 10 MB is emptied when
 * `serve` starts, rather than rotated.
 */

/** The largest the log may be when `serve` starts before it is emptied. */
const MOST_BYTES = 10 * 1024 * 1024;

/** Every log line also appended to `file`, 0600, emptied first when it is over 10 MB. */
export const logsTo = (file: string) =>
  Logger.layer(
    [
      Effect.sync(() => {
        if (existsSync(file) && statSync(file).size > MOST_BYTES)
          truncateSync(file, 0);
        return Logger.map(Logger.formatLogFmt, (line) =>
          appendFileSync(file, `${line}\n`, { mode: 0o600 }),
        );
      }),
    ],
    { mergeWithExisting: true },
  ) satisfies Layer.Layer<never>;
