import { getRandomValues, randomUUID } from 'expo-crypto';

// What Hermes lacks that core and its toolkits use, put in place from the
// app's entry before anything else loads.

// No Web Crypto. Core makes ids with `crypto.randomUUID` (see
// ledger/core/globals.d.ts); expo-crypto gives it, and `getRandomValues`
// for libraries that ask for that instead.
const global = globalThis as { crypto?: Partial<Crypto> };
global.crypto ??= {};
global.crypto.randomUUID ??= randomUUID as Crypto['randomUUID'];
global.crypto.getRandomValues ??= getRandomValues as Crypto['getRandomValues'];

// No ES2023 change-array-by-copy methods: std-toolkit's schema snapshots and
// SQLite setup sort with `toSorted`.
const array = Array.prototype as unknown as Record<string, unknown>;
const define = (
  name: string,
  method: (this: unknown[], ...args: never[]) => unknown,
) => {
  if (typeof array[name] !== 'function')
    Object.defineProperty(Array.prototype, name, {
      value: method,
      writable: true,
      configurable: true,
    });
};
define(
  'toSorted',
  function (this: unknown[], compare?: (a: unknown, b: unknown) => number) {
    return [...this].sort(compare);
  },
);
define('toReversed', function (this: unknown[]) {
  return [...this].reverse();
});
define(
  'toSpliced',
  function (
    this: unknown[],
    start: number,
    count?: number,
    ...items: unknown[]
  ) {
    const copy = [...this];
    if (count === undefined) copy.splice(start);
    else copy.splice(start, count, ...items);
    return copy;
  },
);
define('with', function (this: unknown[], index: number, value: unknown) {
  const copy = [...this];
  copy[index < 0 ? copy.length + index : index] = value;
  return copy;
});
