import type { Paths } from 'type-fest';
import type { MarshalledOutput } from '../attribute-value/index.js';

export interface IndexDefinition {
  readonly pk: string;
  readonly sk: string;
  readonly kind?: 'gsi' | 'lsi';
}

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
 * Extracts all valid dot-notation paths from a type.
 *
 * @typeParam T - The type to extract paths from
 */
export type ValidPaths<T> = unknown extends T
  ? string
  : Paths<T, { bracketNotation: true }>;
