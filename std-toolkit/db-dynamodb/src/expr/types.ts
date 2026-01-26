import type { Get, Paths } from "type-fest";
import type { MarshalledOutput } from "../types/index.js";

/**
 * Result containing DynamoDB expression attribute maps.
 */
export type DynamoAttrResult = {
  /** Map of placeholder names to actual attribute names */
  ExpressionAttributeNames: Record<string, string>;
  /** Map of placeholder names to marshalled attribute values */
  ExpressionAttributeValues: MarshalledOutput;
};

/**
 * Result of compiling a DynamoDB expression.
 */
export type ExprResult = {
  /** The compiled expression string */
  expr: string;
  /** The attribute maps for the expression */
  attrResult: DynamoAttrResult;
};

/**
 * Detects if a type is `any`.
 */
type IsAny<T> = 0 extends 1 & T ? true : false;

/**
 * Extracts all valid dot-notation paths from a type.
 * Falls back to string for any types.
 *
 * @typeParam T - The type to extract paths from
 */
export type ValidPaths<T> =
  IsAny<T> extends true ? string : Paths<T, { bracketNotation: true }>;

/**
 * Extracts valid paths that point to values of a specific type.
 * Falls back to string for any types.
 *
 * @typeParam T - The type to extract paths from
 * @typeParam CondType - The type that path values must extend
 */
export type ValidPathsWithCond<T, CondType> =
  IsAny<T> extends true
    ? string
    : {
        [K in Paths<T, { bracketNotation: true }>]: Get<T, K> extends CondType
          ? K
          : never;
      }[Paths<T, { bracketNotation: true }>];
