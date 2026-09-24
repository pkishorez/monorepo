import { Effect } from 'effect';
import { Argument, Command, Flag } from 'effect/unstable/cli';

import { clientFlags, output, runClient } from '../client-command/index.js';
import { simplifyTrace, simplifyTraceSummary, traceJson } from './simplify.js';
import { renderTraceSummariesText, renderTraceText } from './text.js';

const limit = Flag.integer('limit').pipe(
  Flag.withAlias('n'),
  Flag.withDescription('Maximum number of Traces to return'),
  Flag.withDefault(20),
);

const traceId = Argument.string('trace-id').pipe(
  Argument.withDescription('Trace ID to retrieve'),
);

export const listTracesCommand = Command.make(
  'list-traces',
  { limit, ...clientFlags },
  ({ limit, ...flags }) =>
    runClient(flags, (client) =>
      client
        .ListTraces({ limit })
        .pipe(
          Effect.map((list) =>
            output(
              { items: list.items.map(simplifyTraceSummary) },
              renderTraceSummariesText,
            ),
          ),
        ),
    ),
).pipe(
  Command.withDescription(
    'List the most recently updated Traces, newest first',
  ),
);

export const getTraceCommand = Command.make(
  'get-trace',
  { traceId, ...clientFlags },
  ({ traceId, ...flags }) =>
    runClient(flags, (client) =>
      client.GetTrace({ traceId }).pipe(
        Effect.map(simplifyTrace),
        // JSON leaves out the start time the text offsets are measured from.
        Effect.map((trace) => ({
          json: traceJson(trace),
          text: () => renderTraceText(trace),
        })),
      ),
    ),
).pipe(
  Command.withDescription(
    'Return one Trace: its Spans in start order with their Log Records',
  ),
);
