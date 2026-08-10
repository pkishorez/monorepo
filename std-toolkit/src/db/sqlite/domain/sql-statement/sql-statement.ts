import * as Operations from './operations.js';
import * as Schema from './schema.js';

export const SQL = Object.freeze({
  ...Operations,
  ...Schema,
});

export type { Where } from './operations.js';
export type { ColumnDef, TableColumn } from './schema.js';
export type { Statement } from './statement.js';
