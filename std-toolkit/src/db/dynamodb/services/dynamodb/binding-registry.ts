import { Effect } from 'effect';
import { getTableIdentity } from '../../domain/table-identity/index.js';
import {
  DuplicateTableBinding,
  TableBindingNotFound,
} from '../../domain/dynamodb-error/index.js';
import type {
  ResolvedTableBinding,
  TableBindingInput,
} from './table-binding.js';

export const makeBindingRegistry = (
  bindings: ReadonlyArray<TableBindingInput>,
) => {
  const registry = new Map<object, ResolvedTableBinding>();

  for (const binding of bindings) {
    const identity = getTableIdentity(binding.table);
    if (registry.has(identity)) {
      throw new DuplicateTableBinding({ table: binding.table });
    }
    registry.set(identity, {
      client: binding.client,
      tableName: binding.tableName,
    });
  }

  return {
    resolve: (table: TableBindingInput['table']) => {
      const binding = registry.get(getTableIdentity(table));
      return binding
        ? Effect.succeed(binding)
        : Effect.fail(new TableBindingNotFound({ table }));
    },
  };
};
