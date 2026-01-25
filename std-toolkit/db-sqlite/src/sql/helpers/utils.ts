export type Statement = { query: string; params: unknown[] };

export const sql = (strings: TemplateStringsArray, ...values: unknown[]): string =>
  strings.reduce((acc, str, i) => acc + str + (values[i] ?? ""), "");
