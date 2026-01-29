import { Data } from "effect";

/**
 * Metadata for AWS API errors including HTTP status code and request ID.
 */
export interface AwsErrorMeta {
  /** HTTP status code from the AWS response */
  readonly statusCode: number;
  /** AWS request ID for debugging and support */
  readonly requestId?: string;
}

/**
 * Discriminated union of all possible DynamoDB error types.
 * Each error has a _tag field for pattern matching.
 */
export type DynamodbErrorType =
  | { _tag: "GetItemFailed"; cause: unknown }
  | { _tag: "PutItemFailed"; cause: unknown }
  | { _tag: "UpdateItemFailed"; cause: unknown }
  | { _tag: "DeleteItemFailed"; cause: unknown }
  | { _tag: "QueryFailed"; cause: unknown }
  | { _tag: "ScanFailed"; cause: unknown }
  | { _tag: "TransactionFailed"; cause: unknown }
  | { _tag: "ItemAlreadyExists" }
  | { _tag: "NoItemToUpdate" }
  | { _tag: "NoItemToDelete" }
  | { _tag: "ThrottlingException"; meta: AwsErrorMeta }
  | { _tag: "ServiceUnavailable"; meta: AwsErrorMeta }
  | { _tag: "RequestTimeout"; meta: AwsErrorMeta }
  | { _tag: "AccessDeniedException"; meta: AwsErrorMeta }
  | { _tag: "UnauthorizedException"; meta: AwsErrorMeta }
  | { _tag: "ValidationException"; meta: AwsErrorMeta }
  | { _tag: "UnknownAwsError"; name: string; message: string; meta: AwsErrorMeta };

/**
 * Unified error class for all DynamoDB operations.
 * Uses Effect's Data.TaggedError for structured error handling.
 */
export class DynamodbError extends Data.TaggedError("DynamodbError")<{
  error: DynamodbErrorType;
}> {
  /**
   * Creates an error for a failed GetItem operation.
   *
   * @param cause - The underlying error or message
   */
  static getItemFailed(cause: unknown) {
    return new DynamodbError({ error: { _tag: "GetItemFailed", cause } });
  }

  /**
   * Creates an error for a failed PutItem operation.
   *
   * @param cause - The underlying error or message
   */
  static putItemFailed(cause: unknown) {
    return new DynamodbError({ error: { _tag: "PutItemFailed", cause } });
  }

  /**
   * Creates an error for a failed UpdateItem operation.
   *
   * @param cause - The underlying error or message
   */
  static updateItemFailed(cause: unknown) {
    return new DynamodbError({ error: { _tag: "UpdateItemFailed", cause } });
  }

  /**
   * Creates an error for a failed DeleteItem operation.
   *
   * @param cause - The underlying error or message
   */
  static deleteItemFailed(cause: unknown) {
    return new DynamodbError({ error: { _tag: "DeleteItemFailed", cause } });
  }

  /**
   * Creates an error for a failed Query operation.
   *
   * @param cause - The underlying error or message
   */
  static queryFailed(cause: unknown) {
    return new DynamodbError({ error: { _tag: "QueryFailed", cause } });
  }

  /**
   * Creates an error for a failed Scan operation.
   *
   * @param cause - The underlying error or message
   */
  static scanFailed(cause: unknown) {
    return new DynamodbError({ error: { _tag: "ScanFailed", cause } });
  }

  /**
   * Creates an error for a failed transaction operation.
   *
   * @param cause - The underlying error or message
   */
  static transactionFailed(cause: unknown) {
    return new DynamodbError({ error: { _tag: "TransactionFailed", cause } });
  }

  /**
   * Creates an error when attempting to insert an item that already exists.
   */
  static itemAlreadyExists() {
    return new DynamodbError({ error: { _tag: "ItemAlreadyExists" } });
  }

  /**
   * Creates an error when attempting to update an item that doesn't exist.
   */
  static noItemToUpdate() {
    return new DynamodbError({ error: { _tag: "NoItemToUpdate" } });
  }

  /**
   * Creates an error when attempting to delete an item that doesn't exist.
   */
  static noItemToDelete() {
    return new DynamodbError({ error: { _tag: "NoItemToDelete" } });
  }

  /**
   * Creates an error for AWS throttling responses.
   *
   * @param meta - AWS error metadata
   */
  static throttling(meta: AwsErrorMeta) {
    return new DynamodbError({ error: { _tag: "ThrottlingException", meta } });
  }

  /**
   * Creates an error for AWS service unavailable responses.
   *
   * @param meta - AWS error metadata
   */
  static serviceUnavailable(meta: AwsErrorMeta) {
    return new DynamodbError({ error: { _tag: "ServiceUnavailable", meta } });
  }

  /**
   * Creates an error for AWS request timeout responses.
   *
   * @param meta - AWS error metadata
   */
  static requestTimeout(meta: AwsErrorMeta) {
    return new DynamodbError({ error: { _tag: "RequestTimeout", meta } });
  }

  /**
   * Creates an error for AWS access denied responses.
   *
   * @param meta - AWS error metadata
   */
  static accessDenied(meta: AwsErrorMeta) {
    return new DynamodbError({ error: { _tag: "AccessDeniedException", meta } });
  }

  /**
   * Creates an error for AWS unauthorized responses.
   *
   * @param meta - AWS error metadata
   */
  static unauthorized(meta: AwsErrorMeta) {
    return new DynamodbError({ error: { _tag: "UnauthorizedException", meta } });
  }

  /**
   * Creates an error for AWS validation exception responses.
   *
   * @param meta - AWS error metadata
   */
  static validationException(meta: AwsErrorMeta) {
    return new DynamodbError({ error: { _tag: "ValidationException", meta } });
  }

  /**
   * Creates an error for unhandled AWS error types.
   *
   * @param name - The AWS error name
   * @param message - The error message
   * @param meta - AWS error metadata
   */
  static unknownAwsError(name: string, message: string, meta: AwsErrorMeta) {
    return new DynamodbError({ error: { _tag: "UnknownAwsError", name, message, meta } });
  }
}
