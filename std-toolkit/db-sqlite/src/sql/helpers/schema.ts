import { sql, type Statement } from "./utils.js";

export type TableColumn = { name: string };

export const ISO_NOW = "(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))";

export type ColumnDef =
  | { name: string; type: "TEXT"; nullable?: boolean; default?: string }
  | { name: string; type: "INTEGER"; nullable?: boolean; default?: number | string }
  | { name: string; type: "REAL"; nullable?: boolean; default?: number }
  | { name: string; type: "BLOB"; nullable?: boolean };

export const column = (def: ColumnDef): string => {
  const parts = [def.name, def.type];
  if (!def.nullable) parts.push("NOT NULL");
  if ("default" in def && def.default !== undefined) {
    const val = typeof def.default === "string" && !def.default.startsWith("(")
      ? `'${def.default}'`
      : def.default;
    parts.push(`DEFAULT ${val}`);
  }
  return parts.join(" ");
};

export const createTable = (table: string, columns: string[], pk: string[]): Statement => ({
  query: sql`CREATE TABLE IF NOT EXISTS ${table} (${columns.join(", ")}, PRIMARY KEY (${pk.join(", ")}))`,
  params: [],
});

export const tableInfo = (table: string): Statement => ({
  query: sql`PRAGMA table_info(${table})`,
  params: [],
});

export const addColumn = (table: string, col: string, type: string): Statement => ({
  query: sql`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`,
  params: [],
});

export const columnExists = (columns: TableColumn[], name: string): boolean =>
  columns.some((c) => c.name === name);

export const createIndex = (table: string, name: string, columns: string[]): Statement => ({
  query: sql`CREATE INDEX IF NOT EXISTS ${name} ON ${table} (${columns.join(", ")})`,
  params: [],
});

export const deleteAll = (table: string): Statement => ({
  query: sql`DELETE FROM ${table}`,
  params: [],
});
