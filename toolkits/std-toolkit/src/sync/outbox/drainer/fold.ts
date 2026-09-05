import type { EntityBody, Request } from '../entries/index.js';

const union = (a: ReadonlyArray<string>, b: ReadonlyArray<string>) => [
  ...new Set([...a, ...b]),
];

const keysOf = (value: unknown): string[] =>
  value !== null && typeof value === 'object' ? Object.keys(value) : [];

const step = (soFar: Request, next: EntityBody): Request => {
  switch (next.op) {
    case 'insert':
      return soFar.op === 'delete'
        ? {
            op: 'update',
            base: soFar.base,
            after: next.after,
            changed: keysOf(next.after),
          }
        : { op: 'insert', value: next.after };
    case 'update':
      switch (soFar.op) {
        case 'insert':
          return { op: 'insert', value: next.after };
        case 'update':
          return {
            op: 'update',
            base: soFar.base,
            after: next.after,
            changed: union(soFar.changed, next.changed),
          };
        default:
          return {
            op: 'update',
            base: next.base,
            after: next.after,
            changed: next.changed,
          };
      }
    case 'delete':
      return soFar.op === 'insert'
        ? { op: 'nothing' }
        : {
            op: 'delete',
            base: soFar.op === 'update' ? soFar.base : next.base,
          };
  }
};

// One Queue's pending Entries collapse into the single Request the Backend sees.
export const foldQueue = (entries: ReadonlyArray<EntityBody>): Request =>
  entries.reduce(step, { op: 'nothing' } as Request);
