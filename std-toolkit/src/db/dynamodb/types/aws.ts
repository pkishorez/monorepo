/**
 * DynamoDB attribute value type representing all possible attribute types.
 * Maps to AWS SDK's AttributeValue type.
 */
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

/**
 * A record of attribute names to their marshalled DynamoDB values.
 */
export type MarshalledOutput = Record<string, AttributeValue>;
