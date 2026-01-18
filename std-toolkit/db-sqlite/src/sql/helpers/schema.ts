import { sql, type Statement } from "./utils.js";

export type TableColumn = { name: string };

export const ISO_NOW = `(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;

type ColumnDefBase = {
  name: string;
  nullable?: boolean;
};

export type ColumnDef =
  | (ColumnDefBase & { type: "TEXT"; default?: string })
  | (ColumnDefBase & { type: "INTEGER"; default?: number | string })
  | (ColumnDefBase & { type: "REAL"; default?: number })
  | (ColumnDefBase & { type: "BLOB" });

export const column = (def: ColumnDef): string => {
  const parts = [def.name, def.type];

  if (!def.nullable) {
    parts.push("NOT NULL");
  }

  if ("default" in def && def.default !== undefined) {
    const defaultValue =
      typeof def.default === "string" && !def.default.startsWith("(")
        ? `'${def.default}'`
        : def.default;
    parts.push(`DEFAULT ${defaultValue}`);
  }

  return parts.join(" ");
};

export const createTable = (
  table: string,
  columns: string[],
  primaryKey: string[],
): Statement => ({
  query: sql`CREATE TABLE IF NOT EXISTS ${table} (${columns.join(", ")}, PRIMARY KEY (${primaryKey.join(", ")}))`,
  params: [],
});

export const tableInfo = (table: string): Statement => ({
  query: sql`PRAGMA table_info(${table})`,
  params: [],
});

export const addColumn = (
  table: string,
  column: string,
  type: string,
): Statement => ({
  query: sql`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`,
  params: [],
});

export const columnExists = (
  columns: TableColumn[],
  column: string,
): boolean => columns.some((c) => c.name === column);

export const createIndex = (
  table: string,
  indexName: string,
  columns: string[],
): Statement => ({
  query: sql`CREATE INDEX IF NOT EXISTS ${indexName} ON ${table} (${columns.join(", ")})`,
  params: [],
});

export const deleteAll = (table: string): Statement => ({
  query: sql`DELETE FROM ${table}`,
  params: [],
});
