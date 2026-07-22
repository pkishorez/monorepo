import type { MarshalledOutput } from './aws.js';
import type { EntityType } from '../../../core/index.js';

/**
 * A concrete, executable transaction write in marshalled DynamoDB form.
 */
export type TransactWrite =
  | { kind: 'put'; options: PutOptions }
  | { kind: 'update'; options: UpdateOptions };

/**
 * An entity-level transaction op: a deferred write, concretized by the
 * transaction's write cursor. `table` carries the producing table reference
 * for runtime provenance checks; `apply` is pure — the op has no executable
 * form until `transact` supplies the ULID.
 */
export interface TransactItem {
  readonly entityName: string;
  readonly operationKind: 'insertOp' | 'updateOp' | 'deleteOp' | 'restoreOp';
  readonly pk: string;
  readonly sk: string;
  readonly table: unknown;
  readonly apply: (
    u: string,
  ) => TransactWrite & { broadcast: EntityType<unknown> };
}

/**
 * Options for a DynamoDB Put operation in a transaction.
 */
export interface PutOptions {
  /** The item to put, in marshalled DynamoDB format */
  Item: MarshalledOutput;
  /** Optional condition expression that must be satisfied for the put to succeed */
  ConditionExpression?: string | undefined;
  /** Substitution tokens for attribute names in the condition expression */
  ExpressionAttributeNames?: Record<string, string> | undefined;
  /** Substitution tokens for attribute values in the condition expression */
  ExpressionAttributeValues?: MarshalledOutput | undefined;
  /** Whether to return the item's attributes if the condition check fails */
  ReturnValuesOnConditionCheckFailure?: 'ALL_OLD' | 'NONE' | undefined;
}

/**
 * Options for a DynamoDB Update operation in a transaction.
 */
export interface UpdateOptions {
  /** The primary key of the item to update, in marshalled DynamoDB format */
  Key: MarshalledOutput;
  /** The update expression defining the attributes to modify */
  UpdateExpression: string;
  /** Optional condition expression that must be satisfied for the update to succeed */
  ConditionExpression?: string | undefined;
  /** Substitution tokens for attribute names in expressions */
  ExpressionAttributeNames?: Record<string, string> | undefined;
  /** Substitution tokens for attribute values in expressions */
  ExpressionAttributeValues?: MarshalledOutput | undefined;
  /** Whether to return the item's attributes if the condition check fails */
  ReturnValuesOnConditionCheckFailure?: 'ALL_OLD' | 'NONE' | undefined;
}
