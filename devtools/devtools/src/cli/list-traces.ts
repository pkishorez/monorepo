import { Effect } from 'effect';
import { Command, Flag } from 'effect/unstable/cli';
import { reportClientError, urlFlag, withDevtoolsClient } from './client.js';
import { formatFlag, print } from './output.js';
import {
  renderTraceSummariesText,
  simplifyTraceSummary,
} from './trace-output.js';

const limit = Flag.integer('limit').pipe(
  Flag.withAlias('n'),
  Flag.withDescription('Maximum number of Traces to return'),
  Flag.withDefault(20),
);

export const listTracesCommand = Command.make(
  'list-traces',
  { limit, url: urlFlag, format: formatFlag },
  ({ limit, url, format }) =>
    withDevtoolsClient(url, (client) => client.ListTraces({ limit })).pipe(
      Effect.map((list) => ({ items: list.items.map(simplifyTraceSummary) })),
      Effect.flatMap((list) => print(format, list, renderTraceSummariesText)),
      Effect.catch((error) => reportClientError(error, url)),
    ),
).pipe(
  Command.withDescription(
    'List the most recently updated Traces, newest first',
  ),
);
