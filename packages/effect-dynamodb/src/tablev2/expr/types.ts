export type AttrResult = {
  attrName: Record<string, string>;
  attrValue: Record<string, string>;
};

export type ExprResult = {
  expr: string;
} & AttrResult;
