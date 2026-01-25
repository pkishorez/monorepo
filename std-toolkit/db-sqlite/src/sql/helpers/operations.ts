import { sql, type Statement } from "./utils.js";

export type Where = { clause: string; params: unknown[] };

type Operator = "<" | "<=" | ">" | ">=" | "=";

export const whereNone: Where = { clause: "1=1", params: [] };

export const where = (col: string, op: Operator, value: unknown): Where => ({
  clause: sql`${col} ${op} ?`,
  params: [value],
});

export const whereEquals = (value: string, col = "key"): Where => where(col, "=", value);

export const whereAnd = (...clauses: Where[]): Where => {
  const filtered = clauses.filter((c) => c.clause !== "1=1");
  if (filtered.length === 0) return whereNone;
  if (filtered.length === 1) return filtered[0]!;
  return {
    clause: filtered.map((c) => `(${c.clause})`).join(" AND "),
    params: filtered.flatMap((c) => c.params),
  };
};

export const insert = (table: string, values: Record<string, unknown>): Statement => {
  const keys = Object.keys(values);
  const placeholders = keys.map(() => "?").join(", ");
  return {
    query: sql`INSERT INTO ${table} (${keys.join(", ")}) VALUES (${placeholders})`,
    params: Object.values(values),
  };
};

export const update = (table: string, values: Record<string, unknown>, w: Where): Statement => {
  const keys = Object.keys(values);
  const setClause = keys.map((k) => `${k} = ?`).join(", ");
  return {
    query: sql`UPDATE ${table} SET ${setClause} WHERE ${w.clause}`,
    params: [...Object.values(values), ...w.params],
  };
};

type SelectOptions = { orderBy?: "ASC" | "DESC"; limit?: number; offset?: number };

export const select = (table: string, w: Where, opts?: SelectOptions): Statement => {
  const parts: string[] = [];
  const params = [...w.params];

  if (opts?.orderBy) parts.push(`ORDER BY key ${opts.orderBy}`);
  if (opts?.limit !== undefined) {
    parts.push("LIMIT ?");
    params.push(opts.limit);
  }
  if (opts?.offset !== undefined) {
    parts.push("OFFSET ?");
    params.push(opts.offset);
  }

  const suffix = parts.length > 0 ? ` ${parts.join(" ")}` : "";
  return {
    query: sql`SELECT * FROM ${table} WHERE ${w.clause}${suffix}`,
    params,
  };
};

export const begin = (): Statement => ({ query: "BEGIN TRANSACTION", params: [] });
export const commit = (): Statement => ({ query: "COMMIT", params: [] });
export const rollback = (): Statement => ({ query: "ROLLBACK", params: [] });
