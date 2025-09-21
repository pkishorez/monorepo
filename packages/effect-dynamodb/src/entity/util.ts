import { Array } from 'effect';
import type { ExtractIndexDefType, IndexDef } from './types.js';

export function deriveIndex<Def extends IndexDef<any, string[]>>(
  def: Def,
  item: ExtractIndexDefType<Def>,
) {
  const result = def.derive(item);
  const index = Array.takeWhile((v) => typeof v === 'string')(result);

  if (index.length === 0) {
    return '';
  }

  if (
    result.length !== index.length &&
    !result.slice(index.length).every((v) => typeof v !== 'string')
  ) {
    throw new Error(
      `The index order is: ${def.deps.join(', ')}. But you provided: ${Object.keys(item).join(', ')}`,
    );
  }
  return index.join('#');
}
