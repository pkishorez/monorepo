// Shared result type for all expression builders
export interface ExprResult extends ExprAttributeMap {
  expr: string;
}

export interface ExprAttributeMap {
  attrNameMap: Record<string, string>;
  attrValueMap: Record<string, unknown>;
}
