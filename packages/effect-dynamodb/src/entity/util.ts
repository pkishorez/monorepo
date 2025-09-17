import type { ExtractIndexDefType, IndexDef } from './types.js';

export function deriveIndex<Def extends IndexDef<any, any>>(
  def: Def,
  item: ExtractIndexDefType<Def>,
) {
  if (typeof def === 'string') {
    return def;
  }

  return def.derive(item);
}
