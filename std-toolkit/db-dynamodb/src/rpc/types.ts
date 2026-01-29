import type { AnyESchema } from "@std-toolkit/eschema";
import type { DynamoEntity } from "../services/dynamo-entity.js";
import type { StoredIndexDerivation, StoredTimelineDerivation } from "../services/dynamo-entity.js";
import type { DynamoTableInstance } from "../services/dynamo-table.js";
import { StdToolkitError } from "@std-toolkit/core/rpc";
import { DynamodbError } from "../errors.js";

export type AnyDynamoEntity<S extends AnyESchema = AnyESchema> = DynamoEntity<
  DynamoTableInstance,
  Record<string, StoredIndexDerivation>,
  S,
  string,
  StoredTimelineDerivation | null
>;

export const mapError = (error: DynamodbError): StdToolkitError =>
  new StdToolkitError({
    message: error.error._tag,
    code: error.error._tag,
  });
