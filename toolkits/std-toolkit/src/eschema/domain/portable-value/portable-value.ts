/** Where and why an encoded value is not plain JSON. */
export interface NonPortableValue {
  readonly path: string;
  readonly detail: string;
}

const isPlainObject = (value: object): boolean => {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const pathOf = (path: readonly (string | number)[]) =>
  path.length === 0 ? '/' : `/${path.join('/')}`;

/**
 * The first part of an encoded value that JSON cannot hold unchanged: a
 * non-finite number, `undefined`, a bigint, symbol, or function, a sparse
 * array or one with extra properties, a circular reference, a symbol key, a
 * non-enumerable property, a `toJSON` method, or an object that is not plain
 * (a `Date`, a `Map`, a class instance). Every store and transport receives the encoded
 * form, so a value that passes here reads back as it was written everywhere.
 */
export function findNonPortableValue(
  value: unknown,
): NonPortableValue | undefined {
  const ancestors = new Set<object>();
  const visit = (
    current: unknown,
    path: readonly (string | number)[],
  ): NonPortableValue | undefined => {
    const at = (detail: string) => ({ path: pathOf(path), detail });
    switch (typeof current) {
      case 'string':
      case 'boolean':
        return undefined;
      case 'number':
        return Number.isFinite(current)
          ? undefined
          : at(`${current} is not a JSON number`);
      case 'undefined':
        return at('undefined is not a JSON value');
      case 'object':
        break;
      default:
        return at(`a ${typeof current} is not a JSON value`);
    }
    if (current === null) return undefined;
    if (ancestors.has(current)) return at('a circular reference');
    // JSON writes only own enumerable string keys and calls `toJSON`;
    // anything else it drops or replaces, so refuse it instead.
    if (Object.getOwnPropertySymbols(current).length > 0) {
      return at('a symbol key is not written by JSON');
    }
    if (Array.isArray(current)) {
      if (Object.hasOwn(current, 'toJSON')) {
        return at('a toJSON method replaces the value JSON writes');
      }
      ancestors.add(current);
      for (let index = 0; index < current.length; index++) {
        const found = Object.hasOwn(current, index)
          ? visit(current[index], [...path, index])
          : at(`index ${index} is a hole in a sparse array`);
        if (found !== undefined) return found;
      }
      const extra = Object.getOwnPropertyNames(current).find(
        (key) => key !== 'length' && !/^(0|[1-9][0-9]*)$/.test(key),
      );
      if (extra !== undefined) {
        return at(`the array property "${extra}" is not written by JSON`);
      }
      ancestors.delete(current);
      return undefined;
    }
    if (!isPlainObject(current)) {
      const name = current.constructor?.name ?? 'an object';
      return at(`a ${name} is not a plain JSON object`);
    }
    if ('toJSON' in current) {
      return at('a toJSON method replaces the value JSON writes');
    }
    const hidden = Object.getOwnPropertyNames(current).find(
      (key) => !Object.prototype.propertyIsEnumerable.call(current, key),
    );
    if (hidden !== undefined) {
      return at(
        `the non-enumerable property "${hidden}" is not written by JSON`,
      );
    }
    ancestors.add(current);
    for (const [key, nested] of Object.entries(current)) {
      const found = visit(nested, [...path, key]);
      if (found !== undefined) return found;
    }
    ancestors.delete(current);
    return undefined;
  };
  return visit(value, []);
}
