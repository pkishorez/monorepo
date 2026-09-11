import { Effect, Schema } from 'effect';
import {
  namesView,
  BrowseError,
  type stageTarget,
} from '../../../../shared/contracts/targets/index.ts';
import {
  resourceSummariesView,
  resourceStateView,
  stageOutputsView,
  type resourceTarget,
} from '../../../../shared/contracts/resources/index.ts';
import { read } from '../../../services/alchemy-state/index.ts';

type Connection = Parameters<typeof read>[0];
const invalidState = () => new BrowseError({ code: 'invalid-state' });
const decodeWith =
  <A>(schema: Schema.Codec<A>) =>
  (value: unknown) =>
    Schema.decodeUnknownEffect(schema)(value).pipe(
      Effect.mapError(invalidState),
    );
const names = decodeWith(namesView.fields.data);

export const listStacks = (connection: Connection) =>
  read(connection, { kind: 'stacks' }).pipe(Effect.flatMap(names));
export const listStages = (connection: Connection, stack: string) =>
  read(connection, { kind: 'stages', stack }).pipe(Effect.flatMap(names));
export const listResources = (
  connection: Connection,
  input: typeof stageTarget.Type,
) =>
  read(connection, { kind: 'resources', ...input }).pipe(Effect.flatMap(names));
export const getStageView = (
  connection: Connection,
  input: typeof stageTarget.Type,
) =>
  Effect.all(
    {
      resources: read(connection, { kind: 'summaries', ...input }).pipe(
        Effect.flatMap(decodeWith(resourceSummariesView.fields.data)),
      ),
      outputs: read(connection, { kind: 'outputs', ...input }).pipe(
        Effect.flatMap(decodeWith(stageOutputsView.fields.data)),
      ),
    },
    { concurrency: 'unbounded' },
  );
export const getResourceState = (
  connection: Connection,
  input: typeof resourceTarget.Type,
) =>
  read(connection, { kind: 'resource', ...input }).pipe(
    Effect.flatMap(decodeWith(resourceStateView.fields.data)),
  );
