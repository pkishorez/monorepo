// Shared result type for all expression builders
export interface AttrExprResult {
  expr: string;
  exprAttributes: Record<string, string>;
  exprValues: Record<string, unknown>;
}

export interface CompoundExprResult {
  condition: string;
  exprAttributes: Record<string, string>;
  exprValues: Record<string, unknown>;
}