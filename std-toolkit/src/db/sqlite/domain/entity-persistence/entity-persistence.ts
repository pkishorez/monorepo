import {
  deriveIndexKeyValue,
  extractKeyOp,
  getKeyOpScanDirection,
  sqlMetaSchema,
} from './persistence-model.js';

export const EntityPersistence = Object.freeze({
  deriveIndexKeyValue,
  extractKeyOp,
  getKeyOpScanDirection,
  sqlMetaSchema,
});

export type {
  CustomSkParam,
  CustomStreamSkParam,
  QueryStreamOptions,
  RawRow,
  RowMeta,
  SimpleQueryOptions,
  SkParam,
  StoredIndexDerivation,
  StoredPrimaryDerivation,
  StreamSkParam,
} from './persistence-model.js';
