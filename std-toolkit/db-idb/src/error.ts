import { Data } from "effect";

export type IDBErrorType =
  | { _tag: "OpenFailed"; message: string; cause?: unknown }
  | { _tag: "GetFailed"; message: string; cause?: unknown }
  | { _tag: "PutFailed"; message: string; cause?: unknown }
  | { _tag: "DeleteFailed"; message: string; cause?: unknown }
  | { _tag: "QueryFailed"; message: string; cause?: unknown };

export class IDBError extends Data.TaggedError("IDBError")<{
  error: IDBErrorType;
}> {
  static openFailed(message: string, cause?: unknown) {
    return new IDBError({ error: { _tag: "OpenFailed", message, cause } });
  }

  static getFailed(message: string, cause?: unknown) {
    return new IDBError({ error: { _tag: "GetFailed", message, cause } });
  }

  static putFailed(message: string, cause?: unknown) {
    return new IDBError({ error: { _tag: "PutFailed", message, cause } });
  }

  static deleteFailed(message: string, cause?: unknown) {
    return new IDBError({ error: { _tag: "DeleteFailed", message, cause } });
  }

  static queryFailed(message: string, cause?: unknown) {
    return new IDBError({ error: { _tag: "QueryFailed", message, cause } });
  }
}
