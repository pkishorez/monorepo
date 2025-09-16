import type { ExprAttributeMap } from './types.js';

// Helper to merge expression results
export function mergeExprAttributeMap(results: ExprAttributeMap[]): {
  attrNameMap: Record<string, string>;
  attrValueMap: Record<string, unknown>;
} {
  return results.reduce(
    (acc, result) => ({
      attrNameMap: { ...acc.attrNameMap, ...result.attrNameMap },
      attrValueMap: { ...acc.attrValueMap, ...result.attrValueMap },
    }),
    { attrNameMap: {}, attrValueMap: {} },
  );
}

export class AttributeMapBuilder {
  #i = 1;
  #attrNameMap: Record<string, string> = {};
  #attrValueMap: Record<string, unknown> = {};
  #prefix = '';

  constructor(prefix: `${string}_`) {
    this.#prefix = prefix;
  }

  setAttr(key: string, value: unknown) {
    const attrKey = this.setAttrName(key);
    const attrValue = this.setAttrValue(value);

    return {
      attrKey,
      attrValue,
    };
  }

  setAttrName(key: string) {
    const attrKeys = key.split('.').map((v) => {
      const [value, brackets = ''] = v.split(/(\[.*)/, 2);
      const result = this.#setAttrNameHelper(value);

      return result + brackets;
    });

    return attrKeys.join('.');
  }

  #setAttrNameHelper(key: string) {
    this.#i++;
    const attrKey = `#${this.#prefix}attr_${this.#i}`;
    this.#attrNameMap[attrKey] = key;

    return attrKey;
  }

  setAttrValue(value: unknown) {
    this.#i++;
    const attrValue = `:${this.#prefix}value_${this.#i}`;
    this.#attrValueMap[attrValue] = value;

    return attrValue;
  }

  build(): ExprAttributeMap {
    return {
      attrNameMap: this.#attrNameMap,
      attrValueMap: this.#attrValueMap,
    };
  }
}
