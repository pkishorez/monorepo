import { Data } from 'effect';

export class DynamoDBClientError extends Data.TaggedError(
  'DynamoDBClientError',
)<{
  readonly operation: string;
  readonly cause: unknown;
  readonly statusCode?: number;
  readonly requestId?: string;
  readonly response?: unknown;
}> {}
