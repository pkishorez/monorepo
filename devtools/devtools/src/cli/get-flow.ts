import { Effect } from 'effect';
import { Argument, Command } from 'effect/unstable/cli';
import { reportClientError, urlFlag, withDevtoolsClient } from './client.js';
import { renderFlowText } from './flow-output.js';
import { formatFlag, print } from './output.js';

const flowId = Argument.string('flow-id').pipe(
  Argument.withDescription('Flow ID to retrieve'),
);

export const getFlowCommand = Command.make(
  'get-flow',
  { flowId, url: urlFlag, format: formatFlag },
  ({ flowId, url, format }) =>
    withDevtoolsClient(url, (client) => client.GetFlow({ flowId })).pipe(
      Effect.flatMap((flow) => print(format, flow, renderFlowText)),
      Effect.catch((error) => reportClientError(error, url)),
    ),
).pipe(
  Command.withDescription(
    'Return one Recorded Flow: Participants, Activations, and Flow Items in time order',
  ),
);
