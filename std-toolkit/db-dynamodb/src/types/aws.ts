export interface AwsCredentials {
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly sessionToken?: string;
}

export interface DynamoTableConfig {
  readonly tableName: string;
  readonly region?: string;
  readonly credentials?: AwsCredentials;
  readonly endpoint?: string;
}

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
