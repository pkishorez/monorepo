export {
  type AccessPatternDefinition,
  type AccessPatternMap,
  type GlobalSecondaryIndex,
  type GlobalSecondaryIndexMap,
  type IndexComponent,
  type KeyPath,
  type KeyPathValue,
  type KeyRecord,
  type KeyedEntityBuilder,
  type EntityDeclaration,
  type KeyedEntityBuilderStart,
  type KeyedEntityDeclaration,
  type KeyedEntityDefinition,
  type LocalSecondaryIndex,
  type LocalSecondaryIndexMap,
  type PatternFor,
  type PrimaryComponent,
  type PrimaryIndex,
  type SingleEntityDeclaration,
  type SingleEntityDefinition,
  type TableDefinition,
  type TotalKeyPath,
} from './definition.js';
export { keyPathKind } from './key-path-shape.js';
export {
  declareSingleEntity,
  defineEntity,
  startKeyedEntity,
  type RegisteredEntity,
} from './entity-definition.js';
export {
  addIndex,
  copyTopology,
  makeTopology,
  type MutableTopology,
} from './topology.js';
