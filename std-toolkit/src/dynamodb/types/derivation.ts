/**
 * Definition of a DynamoDB index with partition and sort key names.
 */
export interface IndexDefinition {
  /** Partition key attribute name */
  pk: string;
  /** Sort key attribute name */
  sk: string;
}

/**
 * Defines how to derive index keys from entity fields.
 * The actual key derivation is handled internally based on entity name for primary PK prefix,
 * index name for GSI PK prefix, and deps joined with # for values.
 *
 * @typeParam TItem - The entity item type
 * @typeParam TPkKeys - Keys of TItem used for partition key derivation
 * @typeParam TSkKeys - Keys of TItem used for sort key derivation
 */
export interface IndexDerivation<
  TItem,
  TPkKeys extends keyof TItem,
  TSkKeys extends keyof TItem,
> {
  /** Fields used to derive the partition key */
  pk: TPkKeys[];
  /** Fields used to derive the sort key */
  sk: TSkKeys[];
}

/**
 * Extract the value type needed for an index derivation.
 *
 * @typeParam TItem - The entity item type
 * @typeParam TPkKeys - Keys of TItem used for partition key
 * @typeParam TSkKeys - Keys of TItem used for sort key
 */
export type IndexDerivationValue<
  TItem,
  TPkKeys extends keyof TItem,
  TSkKeys extends keyof TItem,
> = Pick<TItem, TPkKeys> & Pick<TItem, TSkKeys>;

/**
 * Extract just the partition key value type from an entity.
 *
 * @typeParam TItem - The entity item type
 * @typeParam TPkKeys - Keys of TItem used for partition key
 */
export type IndexPkValue<TItem, TPkKeys extends keyof TItem> = Pick<
  TItem,
  TPkKeys
>;

/**
 * Extract just the sort key value type from an entity.
 *
 * @typeParam TItem - The entity item type
 * @typeParam TSkKeys - Keys of TItem used for sort key
 */
export type IndexSkValue<TItem, TSkKeys extends keyof TItem> = Pick<
  TItem,
  TSkKeys
>;
