/*
 * ADR 0019's SQLite layout, copied as it shipped so nothing it reads can move:
 * one `_std_contract` table per database, one row per physical table, keyed
 * case-insensitively as SQLite table names are.
 */

/** The table SQLite setup kept every physical table's Stored contract in. */
export const LEGACY_CONTRACT_TABLE = '_std_contract';

const table = `"${LEGACY_CONTRACT_TABLE}"`;

export const LegacySQL = {
  /** As setup created it. */
  create: `CREATE TABLE IF NOT EXISTS ${table} (table_name TEXT PRIMARY KEY NOT NULL COLLATE NOCASE, mode TEXT NOT NULL, hash TEXT NOT NULL, snapshot TEXT NOT NULL)`,
  /** As setup recorded a first contract: `[tableName, mode, hash, snapshot]`. */
  insert: `INSERT INTO ${table} (table_name, mode, hash, snapshot) VALUES (?, ?, ?, ?) ON CONFLICT (table_name) DO NOTHING`,
  /** Whether the table exists: `[LEGACY_CONTRACT_TABLE]`. */
  exists: `SELECT 1 AS found FROM sqlite_master WHERE type = 'table' AND name = ? COLLATE NOCASE`,
  /** One physical table's row: `[tableName]`. */
  read: `SELECT mode, snapshot FROM ${table} WHERE table_name = ? COLLATE NOCASE`,
  /** `[tableName]`. */
  remove: `DELETE FROM ${table} WHERE table_name = ? COLLATE NOCASE`,
  count: `SELECT count(*) AS n FROM ${table}`,
  drop: `DROP TABLE IF EXISTS ${table}`,
} as const;

/*
 * ADR 0019's IndexedDB layout: one `_std_contract` object store per database,
 * one record per table store, keyed by the store's name.
 */

/** The object store IndexedDB setup kept every store's Stored contract in. */
export const LEGACY_CONTRACT_STORE = '_std_contract';
