import type { Brand } from './brand.js';

export type StdSyncName = string & Brand<'StdSyncName'>;

export const normalizeName = (value: string): string => {
  const name = value
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (name.length === 0) {
    throw new Error('[sync] a name must contain at least one letter or number');
  }
  return name;
};

export const stdSyncName = (value: string): StdSyncName =>
  normalizeName(value) as StdSyncName;
