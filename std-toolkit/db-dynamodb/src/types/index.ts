// Public types for configuration
export type { AwsCredentials } from "./aws.js";

export type { IndexDerivation, IndexKeyDerivation } from "./derivation.js";

export type { TransactItem } from "./transaction.js";

// Internal types (re-exported for internal use only)
export type {
  DynamoTableConfig,
  AttributeValue,
  MarshalledOutput,
} from "./aws.js";

export type {
  IndexDefinition,
  IndexDerivationValue,
  IndexKeyDerivationValue,
  EmptyIndexDerivation,
} from "./derivation.js";

export type { PutOptions, UpdateOptions } from "./transaction.js";
