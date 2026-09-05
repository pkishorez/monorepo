export type AttributeValue =
  | { S: string }
  | { N: string }
  | { B: string }
  | { SS: string[] }
  | { NS: string[] }
  | { BS: string[] }
  | { M: Record<string, AttributeValue> }
  | { L: AttributeValue[] }
  | { NULL: true }
  | { BOOL: boolean };

export type MarshalledOutput = Record<string, AttributeValue>;

export function marshall(value: unknown): MarshalledOutput {
  if (value === null || value === undefined || typeof value !== 'object') {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, toAttributeValue(item)]),
  );
}

export function toAttributeValue(value: unknown): AttributeValue {
  if (value === null || value === undefined) return { NULL: true };
  if (typeof value === 'string') return { S: value };
  if (typeof value === 'number') return { N: String(value) };
  if (typeof value === 'boolean') return { BOOL: value };
  if (Array.isArray(value)) return { L: value.map(toAttributeValue) };
  if (typeof value === 'object') {
    return {
      M: Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
          key,
          toAttributeValue(item),
        ]),
      ),
    };
  }
  return { NULL: true };
}

export function unmarshall(value: MarshalledOutput): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, fromAttributeValue(item)]),
  );
}

export function fromAttributeValue(value: AttributeValue): unknown {
  if ('S' in value) return value.S;
  if ('N' in value) return Number(value.N);
  if ('BOOL' in value) return value.BOOL;
  if ('NULL' in value) return null;
  if ('L' in value) return value.L.map(fromAttributeValue);
  if ('M' in value) {
    return Object.fromEntries(
      Object.entries(value.M).map(([key, item]) => [
        key,
        fromAttributeValue(item),
      ]),
    );
  }
  if ('SS' in value) return value.SS;
  if ('NS' in value) return value.NS.map(Number);
  if ('BS' in value) return value.BS;
  return null;
}

const hasOnlyKey = (
  value: object,
  key: string,
): value is Record<string, unknown> => {
  const keys = Object.keys(value);
  return keys.length === 1 && keys[0] === key;
};

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.every((item) => typeof item === 'string');

const dynamoNumber = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[Ee][+-]?\d+)?$/;

export function isAttributeValueRecord(
  value: unknown,
): value is Record<string, AttributeValue> {
  return (
    typeof value === 'object' &&
    value !== null &&
    Object.entries(value).every(
      ([key, item]) => key.length > 0 && isAttributeValue(item),
    )
  );
}

export function isAttributeValue(value: unknown): value is AttributeValue {
  if (typeof value !== 'object' || value === null) return false;
  if (hasOnlyKey(value, 'S')) return typeof value.S === 'string';
  if (hasOnlyKey(value, 'N'))
    return typeof value.N === 'string' && dynamoNumber.test(value.N);
  if (hasOnlyKey(value, 'B')) return typeof value.B === 'string';
  if (hasOnlyKey(value, 'SS')) return isStringArray(value.SS);
  if (hasOnlyKey(value, 'NS'))
    return (
      isStringArray(value.NS) &&
      value.NS.every((item) => dynamoNumber.test(item))
    );
  if (hasOnlyKey(value, 'BS')) return isStringArray(value.BS);
  if (hasOnlyKey(value, 'NULL')) return value.NULL === true;
  if (hasOnlyKey(value, 'BOOL')) return typeof value.BOOL === 'boolean';
  if (hasOnlyKey(value, 'L'))
    return Array.isArray(value.L) && value.L.every(isAttributeValue);
  if (hasOnlyKey(value, 'M')) return isAttributeValueRecord(value.M);
  return false;
}
