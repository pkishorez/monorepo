import { sql, type Statement } from "./utils.js";

export const createTable = (
  table: string,
  columns: string[],
  primaryKey: string[],
): Statement => ({
  query: sql`CREATE TABLE IF NOT EXISTS ${table} (${columns.join(", ")}, PRIMARY KEY (${primaryKey.join(", ")}))`,
  params: [],
});

export const addColumn = (
  table: string,
  column: string,
  type: string,
): Statement => ({
  query: sql`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column} ${type}`,
  params: [],
});

export const createIndex = (
  table: string,
  indexName: string,
  columns: string[],
): Statement => ({
  query: sql`CREATE INDEX IF NOT EXISTS ${indexName} ON ${table} (${columns.join(", ")})`,
  params: [],
});
