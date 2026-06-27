import type { CollectionItem } from '../types.js';

export const stripMetaPartial = <TItem extends object>(
  item: Partial<CollectionItem<TItem>>,
): Partial<TItem> => {
  const { _meta: _ignored, ...value } = item;
  return value as Partial<TItem>;
};
