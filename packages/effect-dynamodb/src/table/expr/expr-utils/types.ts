// Shared result type for all expression builders
export interface ExprResult {
  expr: string;
  exprAttributes: Record<string, string>;
  exprValues: Record<string, unknown>;
}

