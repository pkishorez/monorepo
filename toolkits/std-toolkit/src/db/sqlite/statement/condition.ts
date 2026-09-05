import type { QueryRequest } from '../../std-table/contract/index.js';
import type { SQLiteValue } from '../item-schema/index.js';
import { quoteIdentifier } from './identifier.js';

interface QueryCursor {
  readonly indexSk: string;
  readonly pk: string;
  readonly sk: string;
}

const nextCodePoint = (code: number) => (code === 0xd7ff ? 0xe000 : code + 1);

const prefixUpperBound = (prefix: string) => {
  const points = [...prefix];
  for (let index = points.length - 1; index >= 0; index--) {
    const code = (points[index] as string).codePointAt(0) as number;
    if (code >= 0x10ffff) continue;
    return [
      ...points.slice(0, index),
      String.fromCodePoint(nextCodePoint(code)),
    ].join('');
  }
  return undefined;
};

export const queryConditions = (
  request: QueryRequest,
  partitionColumn: string,
  sortColumn: string,
  primaryPartitionColumn: string,
  primarySortColumn: string,
  cursor: QueryCursor | undefined,
) => {
  const clauses = [`${quoteIdentifier(partitionColumn)} = ?`];
  const parameters: SQLiteValue[] = [request.pk];
  const sort = request.sort;

  if (sort?.operator === 'between') {
    clauses.push(`${quoteIdentifier(sortColumn)} BETWEEN ? AND ?`);
    parameters.push(...sort.value);
  } else if (sort?.operator === 'beginsWith') {
    if (sort.value !== '') {
      clauses.push(`${quoteIdentifier(sortColumn)} >= ?`);
      parameters.push(sort.value);
      const upper = prefixUpperBound(sort.value);
      if (upper !== undefined) {
        clauses.push(`${quoteIdentifier(sortColumn)} < ?`);
        parameters.push(upper);
      }
    }
  } else if (sort !== undefined) {
    clauses.push(`${quoteIdentifier(sortColumn)} ${sort.operator} ?`);
    parameters.push(sort.value);
  }

  if (cursor !== undefined) {
    clauses.push(
      `(${quoteIdentifier(sortColumn)}, ${quoteIdentifier(primaryPartitionColumn)}, ${quoteIdentifier(primarySortColumn)}) ${request.descending ? '<' : '>'} (?, ?, ?)`,
    );
    parameters.push(cursor.indexSk, cursor.pk, cursor.sk);
  }

  return { clauses, parameters };
};
