import { Console, Effect } from 'effect';
import { Argument, Command } from 'effect/unstable/cli';
import { reportClientError, urlFlag } from './client.js';
import { withFlowProjections } from './flow-journals.js';
import { renderFlowText } from './flow-output.js';
import { formatFlag, print } from './output.js';

const flowId = Argument.string('flow-id').pipe(
  Argument.withDescription('Flow ID to retrieve'),
);

export const getFlowCommand = Command.make(
  'get-flow',
  { flowId, url: urlFlag, format: formatFlag },
  ({ flowId, url, format }) =>
    withFlowProjections(url, (projections) => {
      const projection = projections.find(
        (candidate) => candidate.id === flowId,
      );
      return projection === undefined
        ? Console.error(`Flow not found: ${flowId}`).pipe(
            Effect.andThen(
              Effect.sync(() => {
                process.exitCode = 1;
              }),
            ),
          )
        : print(format, projection, renderFlowText);
    }).pipe(Effect.catch((error) => reportClientError(error, url))),
).pipe(
  Command.withDescription(
    'Return one Flow Projection: Participants, Activations, Waits, and Entries in time order',
  ),
);
