import { sql, type Statement } from "./utils.js";

export type SkOperator = "<" | "<=" | ">" | ">=";
export type SkQuery = { [K in SkOperator]?: string };
export type SkValue = string | SkQuery;

export type Where = {
  clause: string;
  params: unknown[];
};

export const extractSkOp = (
  sk: SkQuery,
): { op: SkOperator; value: string } => {
  if ("<" in sk) return { op: "<", value: sk["<"]! };
  if ("<=" in sk) return { op: "<=", value: sk["<="]! };
  if (">" in sk) return { op: ">", value: sk[">"]! };
  return { op: ">=", value: sk[">="]! };
};

export const getSkOrderDirection = (sk: SkQuery): "ASC" | "DESC" => {
  const { op } = extractSkOp(sk);
  return op === "<" || op === "<=" ? "DESC" : "ASC";
};

export const where = (
  def: { pk: string; sk: SkValue },
  cols: { pk: string; sk: string } = { pk: "pk", sk: "sk" },
): Where => {
  const { pk, sk } = def;

  if (typeof sk === "string") {
    return {
      clause: sql`${cols.pk} = ? AND ${cols.sk} = ?`,
      params: [pk, sk],
    };
  }

  const { op, value } = extractSkOp(sk);

  return {
    clause: sql`${cols.pk} = ? AND ${cols.sk} ${op} ?`,
    params: [pk, value],
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
  const orderByClause = options?.orderBy
    ? ` ORDER BY sk ${options.orderBy}`
    : "";
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
