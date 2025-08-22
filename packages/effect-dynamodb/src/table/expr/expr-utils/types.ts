// Shared result type for all expression builders
export interface ExprResult {
  expr: string;
  exprAttributes: Record<string, string>;
  exprValues: Record<string, unknown>;
}

export type StringAttr<T> = Extract<keyof T, string> | (string & {});
export type AttrValueType<T, Attr extends StringAttr<T> = StringAttr<T>> =
  T extends Record<Attr, infer V> ? V : unknown;
