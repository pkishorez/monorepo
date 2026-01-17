import { StandardSchemaV1 } from "@standard-schema/spec";
import { AnyInputSchema } from "./types";

export function parseMeta(value: unknown): { _v: string } {
  const _v = (value as any)?._v;
  if (typeof _v === "string") {
    return { _v };
  }

  throw new Error("Missing or invalid _v property");
}

export function parseSchema<S extends AnyInputSchema>(
  schema: S,
  value: unknown,
) {
  const result = schema["~standard"].validate(
    value,
  ) as StandardSchemaV1.Result<any>;

  if (result.issues) {
    throw result.issues;
  }

  return result.value;
}
