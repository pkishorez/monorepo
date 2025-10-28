import { IndexDerivation, IndexKeyDerivation } from './types.js';

export const deriveIndexKeyValue = (
  indexDerivation: IndexKeyDerivation<any, any>,
  value: any,
) => {
  return indexDerivation.derive(value).join('#');
};
