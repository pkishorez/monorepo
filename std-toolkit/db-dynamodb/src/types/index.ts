// Public types for configuration
export type { AwsCredentials } from "./aws.js";

export type {
  IndexDerivation,
  IndexDerivationValue,
  IndexPkValue,
  IndexSkValue,
} from "./derivation.js";

export type { TransactItem, TransactItemBase } from "./transaction.js";


// Internal types (re-exported for internal use only)
export type {
  DynamoTableConfig,
  AttributeValue,
  MarshalledOutput,
} from "./aws.js";

export type { IndexDefinition } from "./derivation.js";

export type { PutOptions, UpdateOptions } from "./transaction.js";
