export interface IndexDefinition {
  pk: string;
  sk: string;
}

/**
 * Simplified index derivation - just arrays of field names
 * The actual key derivation is handled internally based on:
 * - Entity name for primary PK prefix
 * - Index name for GSI PK prefix
 * - deps joined with # for values
 */
export interface IndexDerivation<
  TItem,
  TPkKeys extends keyof TItem,
  TSkKeys extends keyof TItem,
> {
  pk: TPkKeys[];
  sk: TSkKeys[];
}

/**
 * Extract the value type needed for an index derivation
 */
export type IndexDerivationValue<
  TItem,
  TPkKeys extends keyof TItem,
  TSkKeys extends keyof TItem,
> = Pick<TItem, TPkKeys> & Pick<TItem, TSkKeys>;

/**
 * Extract just the PK value type
 */
export type IndexPkValue<TItem, TPkKeys extends keyof TItem> = Pick<
  TItem,
  TPkKeys
>;

/**
 * Extract just the SK value type
 */
export type IndexSkValue<TItem, TSkKeys extends keyof TItem> = Pick<
  TItem,
  TSkKeys
>;
