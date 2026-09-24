import { Console, Effect } from 'effect';
import { Flag } from 'effect/unstable/cli';

import {
  urlFlag,
  withDevtoolsClient,
  type DevtoolsClient,
} from './connection.js';
import { reportClientError, type ClientError } from './errors.js';

const formatFlag = Flag.choice('format', ['json', 'text']).pipe(
  Flag.withDescription('Output as machine-readable JSON or readable text'),
  Flag.withDefault('json' as 'json' | 'text'),
);

/** The flags every Client Command takes: where the server is, and how to print. */
export const clientFlags = { url: urlFlag, format: formatFlag };

interface ClientOutput {
  /** Printed as pretty JSON with `--format json`. */
  readonly json: unknown;
  /** Printed with `--format text`. */
  readonly text: () => string;
}

/** The output of a value that prints as itself in JSON and through `renderText` as text. */
export const output = <A>(
  value: A,
  renderText: (value: A) => string,
): ClientOutput => ({ json: value, text: () => renderText(value) });

/**
 * Runs one Client Command against the DevTools Server: connects over RPC,
 * prints what `run` returns as JSON or text, and reports a failure on stderr
 * with a failed exit.
 */
export function runClient(
  flags: { readonly url: string; readonly format: 'json' | 'text' },
  run: (client: DevtoolsClient) => Effect.Effect<ClientOutput, ClientError>,
) {
  return withDevtoolsClient(flags.url, run).pipe(
    Effect.flatMap((result) =>
      Console.log(
        flags.format === 'json'
          ? JSON.stringify(result.json, null, 2)
          : result.text(),
      ),
    ),
    Effect.catch((error) => reportClientError(error, flags.url)),
  );
}
