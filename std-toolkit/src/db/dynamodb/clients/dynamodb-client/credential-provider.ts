export interface DynamoDBCredentials {
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly sessionToken?: string;
}

export type DynamoDBCredentialProvider = () =>
  | DynamoDBCredentials
  | Promise<DynamoDBCredentials>;

export type DynamoDBCredentialsInput =
  | DynamoDBCredentials
  | DynamoDBCredentialProvider;

export const resolveCredentials = async (
  input: DynamoDBCredentialsInput,
): Promise<DynamoDBCredentials> =>
  typeof input === 'function' ? input() : input;
