import { Get, Paths } from 'type-fest';
import { MarshalledOutput } from '../utils.js';

export type DynamoAttrResult = {
  ExpressionAttributeNames: Record<string, string>;
  ExpressionAttributeValues: MarshalledOutput;
};

export type ExprResult = {
  expr: string;
  attrResult: DynamoAttrResult;
};

// Type helper to detect if T is 'any'
// This works because 'any' is both a subtype and supertype of all types
type IsAny<T> = 0 extends 1 & T ? true : false;

// ValidPaths that relaxes to string when T is any
export type ValidPaths<T> =
  IsAny<T> extends true ? string : Paths<T, { bracketNotation: true }>;

// ValidPathsWithCond that relaxes to string when T is any
export type ValidPathsWithCond<T, CondType> =
  IsAny<T> extends true
    ? string
    : {
        [K in Paths<T, { bracketNotation: true }>]: Get<T, K> extends CondType
          ? K
          : never;
      }[Paths<T, { bracketNotation: true }>];
