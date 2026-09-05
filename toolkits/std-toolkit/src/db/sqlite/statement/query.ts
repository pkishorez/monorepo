import type { QueryRequest } from '../../std-table/contract/index.js';
import { queryConditions } from './condition.js';
import { quoteIdentifier } from './identifier.js';

interface QueryCursor {
  readonly indexSk: string;
  readonly pk: string;
  readonly sk: string;
}

export const selectPage = (
  tableName: string,
  request: QueryRequest,
  partitionColumn: string,
  sortColumn: string,
  primaryPartitionColumn: string,
  primarySortColumn: string,
  cursor: QueryCursor | undefined,
) => {
  const { clauses, parameters } = queryConditions(
    request,
    partitionColumn,
    sortColumn,
    primaryPartitionColumn,
    primarySortColumn,
    cursor,
  );
  const direction = request.descending ? 'DESC' : 'ASC';
  parameters.push(request.limit + 1);

  return {
    sql: `SELECT * FROM ${quoteIdentifier(tableName)} WHERE ${clauses.join(' AND ')} ORDER BY ${quoteIdentifier(sortColumn)} ${direction}, ${quoteIdentifier(primaryPartitionColumn)} ${direction}, ${quoteIdentifier(primarySortColumn)} ${direction} LIMIT ?`,
    parameters,
  };
};
