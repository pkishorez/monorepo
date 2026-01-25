import type { Get, Paths } from "type-fest";
import type { MarshalledOutput } from "../types/index.js";

export type DynamoAttrResult = {
  ExpressionAttributeNames: Record<string, string>;
  ExpressionAttributeValues: MarshalledOutput;
};

export type ExprResult = {
  expr: string;
  attrResult: DynamoAttrResult;
};

type IsAny<T> = 0 extends 1 & T ? true : false;

export type ValidPaths<T> =
  IsAny<T> extends true ? string : Paths<T, { bracketNotation: true }>;

export type ValidPathsWithCond<T, CondType> =
  IsAny<T> extends true
    ? string
    : {
        [K in Paths<T, { bracketNotation: true }>]: Get<T, K> extends CondType
          ? K
          : never;
      }[Paths<T, { bracketNotation: true }>];
