import { Data } from "effect";

export class ESchemaError extends Data.TaggedError("ESchemaError")<{
  message: string;
  data?: unknown;
  cause?: unknown;
}> {}
