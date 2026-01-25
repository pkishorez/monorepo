import { Data } from "effect";

export interface AwsErrorMeta {
  readonly statusCode: number;
  readonly requestId?: string;
}

export type DynamodbErrorType =
  // Table/Entity operation errors
  | { _tag: "GetItemFailed"; cause: unknown }
  | { _tag: "PutItemFailed"; cause: unknown }
  | { _tag: "UpdateItemFailed"; cause: unknown }
  | { _tag: "DeleteItemFailed"; cause: unknown }
  | { _tag: "QueryFailed"; cause: unknown }
  | { _tag: "ScanFailed"; cause: unknown }
  | { _tag: "TransactionFailed"; cause: unknown }
  // Domain-specific errors
  | { _tag: "ItemAlreadyExists" }
  | { _tag: "NoItemToUpdate" }
  // AWS errors (embedded with full metadata)
  | { _tag: "ThrottlingException"; meta: AwsErrorMeta }
  | { _tag: "ServiceUnavailable"; meta: AwsErrorMeta }
  | { _tag: "RequestTimeout"; meta: AwsErrorMeta }
  | { _tag: "AccessDeniedException"; meta: AwsErrorMeta }
  | { _tag: "UnauthorizedException"; meta: AwsErrorMeta }
  | { _tag: "ValidationException"; meta: AwsErrorMeta }
  | { _tag: "UnknownAwsError"; name: string; message: string; meta: AwsErrorMeta };

export class DynamodbError extends Data.TaggedError("DynamodbError")<{
  error: DynamodbErrorType;
}> {
  // Table/Entity operation errors
  static getItemFailed(cause: unknown) {
    return new DynamodbError({ error: { _tag: "GetItemFailed", cause } });
  }

  static putItemFailed(cause: unknown) {
    return new DynamodbError({ error: { _tag: "PutItemFailed", cause } });
  }

  static updateItemFailed(cause: unknown) {
    return new DynamodbError({ error: { _tag: "UpdateItemFailed", cause } });
  }

  static deleteItemFailed(cause: unknown) {
    return new DynamodbError({ error: { _tag: "DeleteItemFailed", cause } });
  }

  static queryFailed(cause: unknown) {
    return new DynamodbError({ error: { _tag: "QueryFailed", cause } });
  }

  static scanFailed(cause: unknown) {
    return new DynamodbError({ error: { _tag: "ScanFailed", cause } });
  }

  static transactionFailed(cause: unknown) {
    return new DynamodbError({ error: { _tag: "TransactionFailed", cause } });
  }

  // Domain-specific errors
  static itemAlreadyExists() {
    return new DynamodbError({ error: { _tag: "ItemAlreadyExists" } });
  }

  static noItemToUpdate() {
    return new DynamodbError({ error: { _tag: "NoItemToUpdate" } });
  }

  // AWS errors
  static throttling(meta: AwsErrorMeta) {
    return new DynamodbError({ error: { _tag: "ThrottlingException", meta } });
  }

  static serviceUnavailable(meta: AwsErrorMeta) {
    return new DynamodbError({ error: { _tag: "ServiceUnavailable", meta } });
  }

  static requestTimeout(meta: AwsErrorMeta) {
    return new DynamodbError({ error: { _tag: "RequestTimeout", meta } });
  }

  static accessDenied(meta: AwsErrorMeta) {
    return new DynamodbError({ error: { _tag: "AccessDeniedException", meta } });
  }

  static unauthorized(meta: AwsErrorMeta) {
    return new DynamodbError({ error: { _tag: "UnauthorizedException", meta } });
  }

  static validationException(meta: AwsErrorMeta) {
    return new DynamodbError({ error: { _tag: "ValidationException", meta } });
  }

  static unknownAwsError(name: string, message: string, meta: AwsErrorMeta) {
    return new DynamodbError({ error: { _tag: "UnknownAwsError", name, message, meta } });
  }
}

/**
 * Type alias for backwards compatibility with generated types.
 * @deprecated Use DynamodbError directly.
 */
export type CommonAwsError = DynamodbError;
