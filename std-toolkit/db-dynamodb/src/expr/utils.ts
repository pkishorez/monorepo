import { convertToAttr } from "../internal/marshall.js";
import type { MarshalledOutput } from "../types/index.js";
import type { DynamoAttrResult } from "./types.js";

/**
 * Empty attribute result constant for initialization.
 */
const emptyAttrResult: DynamoAttrResult = {
  ExpressionAttributeNames: {},
  ExpressionAttributeValues: {},
};

/**
 * Builder for constructing DynamoDB expression attribute name and value maps.
 * Handles the conversion of attribute paths to placeholder tokens and values to marshalled format.
 */
export class AttributeMapBuilder {
  #i = 0;
  #attrNameMap: Record<string, string> = {};
  #attrValueMap: MarshalledOutput = {};
  #prefix = "";

  /**
   * Creates a new AttributeMapBuilder with the specified prefix.
   *
   * @param prefix - Prefix for generated attribute placeholders (u_ for update, cf_ for condition/filter, k_ for key)
   */
  constructor(prefix: `${"u" | "cf" | "k"}_`) {
    this.#prefix = prefix;
  }

  /**
   * Converts an attribute path to a placeholder reference.
   * Handles dot notation and bracket notation for nested paths.
   *
   * @param key - The attribute path (e.g., "user.name" or "items[0].id")
   * @returns The placeholder reference string
   */
  attr(key: string) {
    const attrKeys = key.split(".").map((v) => {
      const [value, brackets = ""] = v.split(/(\[.*)/, 2);
      const result = this.#attrHelper(value!);
      return result + brackets;
    });

    return attrKeys.join(".");
  }

  /**
   * Registers a value and returns its placeholder reference.
   *
   * @param value - The value to register
   * @returns The placeholder reference string (e.g., ":u_value_1")
   */
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

  /**
   * Builds and returns the final attribute maps.
   *
   * @returns The DynamoAttrResult containing both name and value maps
   */
  build(): DynamoAttrResult {
    return {
      ExpressionAttributeNames: this.#attrNameMap,
      ExpressionAttributeValues: this.#attrValueMap,
    };
  }

  /**
   * Merges multiple attribute results into a single result.
   *
   * @param attrResults - Array of DynamoAttrResult objects to merge
   * @returns A single merged DynamoAttrResult
   */
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
