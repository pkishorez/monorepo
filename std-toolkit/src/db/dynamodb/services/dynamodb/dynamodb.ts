import { Context, Effect, Layer } from 'effect';
import {
  makeDynamoDBClient,
  type DynamoDBClientConfig,
} from '../../clients/dynamodb-client/index.js';
import type { TableIdentity } from '../../domain/table-identity/index.js';
import type { TableBindingNotFound } from '../dynamodb-error/index.js';
import { makeBindingRegistry } from './binding-registry.js';
import type {
  ResolvedTableBinding,
  TableBindingInput,
} from './table-binding.js';

export interface DynamoDBService {
  readonly resolve: (
    table: TableIdentity,
  ) => Effect.Effect<ResolvedTableBinding, TableBindingNotFound>;
}

export class DynamoDB extends Context.Service<DynamoDB, DynamoDBService>()(
  'std-toolkit/DynamoDB',
) {
  static readonly client = (config: DynamoDBClientConfig) =>
    makeDynamoDBClient(config);

  static readonly layer = (
    ...bindings: ReadonlyArray<TableBindingInput>
  ): Layer.Layer<DynamoDB> =>
    Layer.succeed(DynamoDB, makeBindingRegistry(bindings));

  static readonly resolve = (
    table: TableIdentity,
  ): Effect.Effect<ResolvedTableBinding, TableBindingNotFound, DynamoDB> =>
    Effect.flatMap(DynamoDB, ({ resolve }) => resolve(table));
}

export type { ResolvedTableBinding, TableBindingInput };
