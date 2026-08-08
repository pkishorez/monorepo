export {
  marshall,
  unmarshall,
  toAttributeValue as convertToAttr,
} from '../domain/attribute-value/index.js';

export const deriveIndexKeyValue = (
  prefix: string,
  deps: string[],
  value: Record<string, unknown>,
  isPrimaryKey: boolean,
): string => {
  if (deps.length === 0) return prefix;
  const values = deps.map((dep) => String(value[dep] ?? ''));
  return isPrimaryKey ? `${prefix}#${values.join('#')}` : values.join('#');
};
