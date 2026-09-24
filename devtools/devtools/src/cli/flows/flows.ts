import { Effect } from 'effect';
import { Argument, Command, Flag } from 'effect/unstable/cli';

import { clientFlags, output, runClient } from '../client-command/index.js';
import {
  renderFlowListText,
  renderFlowText,
  simplifyFlowList,
} from './output.js';
import { projectFlows } from './projections.js';

const limit = Flag.integer('limit').pipe(
  Flag.withAlias('n'),
  Flag.withDescription('Maximum number of Flows to return'),
  Flag.withDefault(20),
);

const flowId = Argument.string('flow-id').pipe(
  Argument.withDescription('Flow ID to retrieve'),
);

// Flows are projected from every stored Entry on each request.
const everyEntry = { _u: { '>': null } } as const;

export const listFlowsCommand = Command.make(
  'list-flows',
  { limit, ...clientFlags },
  ({ limit, ...flags }) =>
    runClient(flags, (client) =>
      client
        .ListFlowEntries(everyEntry)
        .pipe(
          Effect.map(({ items }) =>
            output(
              simplifyFlowList(projectFlows(items), limit),
              renderFlowListText,
            ),
          ),
        ),
    ),
).pipe(
  Command.withDescription('List the most recently updated Flows, newest first'),
);

export const getFlowCommand = Command.make(
  'get-flow',
  { flowId, ...clientFlags },
  ({ flowId, ...flags }) =>
    runClient(flags, (client) =>
      client.ListFlowEntries(everyEntry).pipe(
        Effect.flatMap(({ items }) => {
          const projection = projectFlows(items).find(
            (candidate) => candidate.id === flowId,
          );
          return projection === undefined
            ? Effect.fail({ _tag: 'FlowNotFound', flowId } as const)
            : Effect.succeed(output(projection, renderFlowText));
        }),
      ),
    ),
).pipe(
  Command.withDescription(
    'Return one Flow Projection: Participants, Activations, Waits, and Entries in time order',
  ),
);
