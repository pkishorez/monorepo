import { Effect } from 'effect';
import { Command, Flag } from 'effect/unstable/cli';
import { reportClientError, urlFlag, withDevtoolsClient } from './client.js';
import { renderFlowListText, simplifyFlowList } from './flow-output.js';
import { formatFlag, print } from './output.js';

const limit = Flag.integer('limit').pipe(
  Flag.withAlias('n'),
  Flag.withDescription('Maximum number of Flows to return'),
  Flag.withDefault(20),
);

export const listFlowsCommand = Command.make(
  'list-flows',
  { limit, url: urlFlag, format: formatFlag },
  ({ limit, url, format }) =>
    withDevtoolsClient(url, (client) =>
      client.ListFlows({ _u: { '<': null }, limit }),
    ).pipe(
      Effect.map(simplifyFlowList),
      Effect.flatMap((list) => print(format, list, renderFlowListText)),
      Effect.catch((error) => reportClientError(error, url)),
    ),
).pipe(
  Command.withDescription('List the most recently updated Flows, newest first'),
);
