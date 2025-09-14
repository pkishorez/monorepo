import type { ConditionalKeys } from 'type-fest';
import type { ExprResult } from './expr-utils/types.js';

export type ProjectionKeys<Item> = (keyof Item & string)[];

// Type tests to verify ProjectionKeys works correctly
type Test1 = ProjectionKeys<{ a: string; b: number }>; // Should be ("a" | "b")[]
type Test2 = ProjectionKeys<{ a: string; b: any[] }>; // Should be ("a" | "b")[]
type Test3 = ProjectionKeys<Record<string, unknown>>; // Should be (string)[]
type Test4 = ProjectionKeys<Record<string, any>>; // Should be (string)[]

// Verify the types are correct
const _test1: Test1 = ['a', 'b']; // Valid
const _test2: Test2 = ['a', 'b']; // Valid
const _test3: Test3 = ['any', 'string', 'here']; // Valid
const _test4: Test4 = ['any', 'string', 'here']; // Valid

export function projectionExpr(attrs: string[]): ExprResult {
  const exprAttributes: ExprResult['exprAttributes'] = {};

  const condition = attrs
    .map((v, i) => {
      const attrKey = `#proj_attr${i + 1}`;
      exprAttributes[attrKey] = v;
      return attrKey;
    })
    .join(', ');

  return { expr: condition, exprAttributes, exprValues: {} };
}
