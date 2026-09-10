import { Effect, Schema } from 'effect';
import {
  namesView,
  StoreDetailsError,
} from '../../../../shared/contracts/state-address/index.ts';
import { read } from '../../../services/alchemy-state/index.ts';
import { listStacks as stacks } from './list-stacks.ts';
import { listStages as stages } from './list-stages.ts';
import { listResources as resources } from './list-resources.ts';

type Connection = Parameters<typeof read>[0];
const decode = Schema.decodeUnknownEffect(namesView.fields.data);
const validate = Effect.flatMap((value: unknown) =>
  decode(value).pipe(
    Effect.mapError(() => new StoreDetailsError({ code: 'invalid-state' })),
  ),
);
export const listStacks = (connection: Connection) =>
  stacks(connection).pipe(validate);
export const listStages = (connection: Connection, stack: string) =>
  stages(connection, stack).pipe(validate);
export const listResources = (
  connection: Connection,
  stack: string,
  stage: string,
) => resources(connection, stack, stage).pipe(validate);
