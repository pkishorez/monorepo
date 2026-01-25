export type {
  AwsCredentials,
  DynamoTableConfig,
  AttributeValue,
  MarshalledOutput,
} from "./aws.js";

export type {
  IndexDefinition,
  IndexDerivation,
  IndexKeyDerivation,
  IndexDerivationValue,
  IndexKeyDerivationValue,
  EmptyIndexDerivation,
} from "./derivation.js";

export type { TransactItem, PutOptions, UpdateOptions } from "./transaction.js";
