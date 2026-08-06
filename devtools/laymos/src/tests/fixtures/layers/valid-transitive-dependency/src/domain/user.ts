import type { Database } from '../infrastructure/database.js';

export function findUser(database: Database): string {
  return database.name;
}
