import { sql, type Statement } from "./utils.js";

type SkOperator = "<" | "<=" | ">" | ">=";
type SkValue = string | { [K in SkOperator]?: string };

export type Where = {
  clause: string;
  params: unknown[];
};

export const where = (def: { pk: string; sk: SkValue }): Where => {
  const { pk, sk } = def;

  if (typeof sk === "string") {
    return {
      clause: sql`pk = ? AND sk = ?`,
      params: [pk, sk],
    };
  }

  const op = Object.keys(sk)[0] as SkOperator;
  const skValue = sk[op];

  return {
    clause: sql`pk = ? AND sk ${op} ?`,
    params: [pk, skValue],
  };
};

export const insert = (
  table: string,
  values: Record<string, unknown>,
): Statement => {
  const keys = Object.keys(values);
  const vals = Object.values(values);
  const placeholders = keys.map(() => "?").join(", ");

  return {
    query: sql`INSERT INTO ${table} (${keys.join(", ")}) VALUES (${placeholders})`,
    params: vals,
  };
};

export const update = (
  table: string,
  values: Record<string, unknown>,
  w: Where,
): Statement => {
  const keys = Object.keys(values);
  const vals = Object.values(values);
  const setClause = keys.map((k) => `${k} = ?`).join(", ");

  return {
    query: sql`UPDATE ${table} SET ${setClause} WHERE ${w.clause}`,
    params: [...vals, ...w.params],
  };
};

export const select = (
  table: string,
  w: Where,
  options?: { orderBy?: "ASC" | "DESC"; limit?: number; offset?: number },
): Statement => {
  const params = [...w.params];
  const orderByClause = options?.orderBy ? ` ORDER BY sk ${options.orderBy}` : "";
  const limitClause = options?.limit !== undefined ? " LIMIT ?" : "";
  const offsetClause = options?.offset !== undefined ? " OFFSET ?" : "";

  if (options?.limit !== undefined) params.push(options.limit);
  if (options?.offset !== undefined) params.push(options.offset);

  return {
    query: sql`SELECT * FROM ${table} WHERE ${w.clause}${orderByClause}${limitClause}${offsetClause}`,
    params,
  };
};

export const begin = (): Statement => ({
  query: sql`BEGIN TRANSACTION`,
  params: [],
});

export const commit = (): Statement => ({
  query: sql`COMMIT`,
  params: [],
});

export const rollback = (): Statement => ({
  query: sql`ROLLBACK`,
  params: [],
});
