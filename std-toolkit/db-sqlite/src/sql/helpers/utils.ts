export const sql = (strings: TemplateStringsArray, ...values: string[]): string => {
  let result = "";
  for (let i = 0; i < strings.length; i++) {
    result += strings[i];
    if (i < values.length) {
      result += values[i];
    }
  }
  return result;
};

export type Statement = { query: string; params: unknown[] };
