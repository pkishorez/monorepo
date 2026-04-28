import type { AnyEntityESchema, ESchemaEncoded } from '@std-toolkit/eschema';
import type { DynamoEntity } from '../services/dynamo-entity.js';
import type { StoredIndexDerivation } from '../services/dynamo-entity.js';
import type { DynamoTable } from '../services/dynamo-table.js';
import { StdToolkitError } from '@std-toolkit/core/rpc';
import { DynamodbError } from '../errors.js';
import type { EntityRow, EntityType } from '@std-toolkit/core';

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

/**
 * Drops the server-only `decoded` Effect from a row before it crosses an RPC
 * boundary (the wire schema is `EntityType<ESchemaEncoded<S>>`, no closures).
 */
export const stripDecoded = <S extends AnyEntityESchema>(
  row: EntityRow<S>,
): EntityType<ESchemaEncoded<S>> => ({ value: row.value, meta: row.meta });
