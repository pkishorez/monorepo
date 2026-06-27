/**
 * AWS credentials for authenticating with DynamoDB.
 */
export interface AwsCredentials {
  /** AWS access key ID */
  readonly accessKeyId: string;
  /** AWS secret access key */
  readonly secretAccessKey: string;
  /** Optional session token for temporary credentials */
  readonly sessionToken?: string;
}

/**
 * Connection details for a live DynamoDB client, provided via `dynamoDBLayer`.
 *
 * This binds a table definition (pure topology) to a physical table in a
 * specific environment: its name plus how to reach it.
 */
export interface DynamoConnection {
  /** Name of the DynamoDB table */
  readonly tableName: string;
  /** AWS region where the table is located */
  readonly region?: string;
  /** AWS credentials for authentication */
  readonly credentials: AwsCredentials;
  /** Custom endpoint URL for local development or DynamoDB-compatible services */
  readonly endpoint?: string;
}

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
