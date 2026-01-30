import { Data } from "effect";

export type CacheErrorType =
  | { _tag: "OpenFailed"; message: string; cause?: unknown }
  | { _tag: "GetFailed"; message: string; cause?: unknown }
  | { _tag: "PutFailed"; message: string; cause?: unknown }
  | { _tag: "DeleteFailed"; message: string; cause?: unknown }
  | { _tag: "ClearFailed"; message: string; cause?: unknown };

export class CacheError extends Data.TaggedError("CacheError")<{
  error: CacheErrorType;
}> {
  static openFailed(message: string, cause?: unknown) {
    return new CacheError({ error: { _tag: "OpenFailed", message, cause } });
  }

  static getFailed(message: string, cause?: unknown) {
    return new CacheError({ error: { _tag: "GetFailed", message, cause } });
  }

  static putFailed(message: string, cause?: unknown) {
    return new CacheError({ error: { _tag: "PutFailed", message, cause } });
  }

  static deleteFailed(message: string, cause?: unknown) {
    return new CacheError({ error: { _tag: "DeleteFailed", message, cause } });
  }

  static clearFailed(message: string, cause?: unknown) {
    return new CacheError({ error: { _tag: "ClearFailed", message, cause } });
  }
}
