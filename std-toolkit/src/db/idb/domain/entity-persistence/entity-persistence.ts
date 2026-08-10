import {
  deriveIndexKeyValue,
  extractKeyOp,
  getKeyOpScanDirection,
} from './persistence-model.js';

export const EntityPersistence = Object.freeze({
  deriveIndexKeyValue,
  extractKeyOp,
  getKeyOpScanDirection,
});

export type {
  CustomSkParam,
  CustomStreamSkParam,
  QueryStreamOptions,
  SimpleQueryOptions,
  SkParam,
  StoredIndexDerivation,
  StoredPrimaryDerivation,
  StreamSkParam,
} from './persistence-model.js';
