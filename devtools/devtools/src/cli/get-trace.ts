import { Effect } from 'effect';
import { Argument, Command } from 'effect/unstable/cli';
import { reportClientError, urlFlag, withDevtoolsClient } from './client.js';
import { formatFlag, print } from './output.js';
import { renderTraceText, simplifyTrace, traceJson } from './trace-output.js';

const traceId = Argument.string('trace-id').pipe(
  Argument.withDescription('Trace ID to retrieve'),
);

export const getTraceCommand = Command.make(
  'get-trace',
  { traceId, url: urlFlag, format: formatFlag },
  ({ traceId, url, format }) =>
    withDevtoolsClient(url, (client) => client.GetTrace({ traceId })).pipe(
      Effect.map(simplifyTrace),
      Effect.flatMap((trace) =>
        format === 'json'
          ? print('json', traceJson(trace), () => '')
          : print('text', trace, renderTraceText),
      ),
      Effect.catch((error) => reportClientError(error, url)),
    ),
).pipe(
  Command.withDescription(
    'Return one Trace: its Spans in start order with their Log Records',
  ),
);
