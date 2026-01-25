import { convertToAttr } from "../internal/marshall.js";
import type { MarshalledOutput } from "../types/index.js";
import type { DynamoAttrResult } from "./types.js";

const emptyAttrResult: DynamoAttrResult = {
  ExpressionAttributeNames: {},
  ExpressionAttributeValues: {},
};

export class AttributeMapBuilder {
  #i = 0;
  #attrNameMap: Record<string, string> = {};
  #attrValueMap: MarshalledOutput = {};
  #prefix = "";

  constructor(prefix: `${"u" | "cf" | "k"}_`) {
    this.#prefix = prefix;
  }

  attr(key: string) {
    const attrKeys = key.split(".").map((v) => {
      const [value, brackets = ""] = v.split(/(\[.*)/, 2);
      const result = this.#attrHelper(value!);
      return result + brackets;
    });

    return attrKeys.join(".");
  }

  value(value: unknown) {
    this.#i++;
    const attrValue = `:${this.#prefix}value_${this.#i}`;
    this.#attrValueMap[attrValue] = convertToAttr(value);
    return attrValue;
  }

  #attrHelper(key: string) {
    this.#i++;
    const attrKey = `#${this.#prefix}attr_${this.#i}`;
    this.#attrNameMap[attrKey] = key;
    return attrKey;
  }

  build(): DynamoAttrResult {
    return {
      ExpressionAttributeNames: this.#attrNameMap,
      ExpressionAttributeValues: this.#attrValueMap,
    };
  }

  static mergeAttrResults = (attrResults: DynamoAttrResult[]) =>
    attrResults.reduce(
      (acc, v) => ({
        ExpressionAttributeNames: {
          ...acc.ExpressionAttributeNames,
          ...v.ExpressionAttributeNames,
        },
        ExpressionAttributeValues: {
          ...acc.ExpressionAttributeValues,
          ...v.ExpressionAttributeValues,
        },
      }),
      emptyAttrResult,
    );
}
