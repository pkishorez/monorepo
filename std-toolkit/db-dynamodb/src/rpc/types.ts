import type { AnyEntityESchema } from '@std-toolkit/eschema';
import type { DynamoEntity } from '../services/dynamo-entity.js';
import type { StoredIndexDerivation } from '../services/dynamo-entity.js';
import type { DynamoTable } from '../services/dynamo-table.js';
import { StdToolkitError } from '@std-toolkit/core/rpc';
import { DynamodbError } from '../errors.js';

export type AnyDynamoEntity<S extends AnyEntityESchema = AnyEntityESchema> =
  DynamoEntity<
    DynamoTable<any, any>,
    Record<string, StoredIndexDerivation>,
    S,
    string
  >;

export const mapError = (error: DynamodbError): StdToolkitError =>
  new StdToolkitError({
    message: error.error._tag,
    code: error.error._tag,
  });
