import type { SqlStorage } from '@cloudflare/workers-types';
import { IndexDefinition } from '@std-toolkit/core/types.js';

export class SqliteTable<IndexMap extends Record<string, IndexDefinition>> {
  static make(tableName: string, execSql: SqlStorage) {
    class Builder<IndexMap extends Record<string, IndexDefinition>> {
      #indexMap: IndexMap;

      constructor(indexMap: IndexMap) {
        this.#indexMap = indexMap;
      }

      index<Name extends string>(name: Name, def: IndexDefinition) {
        return new Builder<IndexMap & { [K in Name]: IndexDefinition }>({
          ...this.#indexMap,
          [name]: def,
        });
      }

      build() {
        return new SqliteTable<IndexMap>(tableName, this.#indexMap, execSql);
      }
    }

    return new Builder<{}>({});
  }

  readonly tableName: string;
  readonly sql: SqlStorage;
  readonly indexMap: IndexMap;

  constructor(tableName: string, indexMap: IndexMap, execSql: SqlStorage) {
    this.tableName = tableName;
    this.indexMap = indexMap;
    this.sql = execSql;
  }

  setupTable(options?: { debug?: boolean }) {
    const query = `
CREATE TABLE IF NOT EXISTS ${this.tableName} (
  pk TEXT,
  sk TEXT,
  data TEXT,
  updatedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  entity TEXT,
  __v TEXT,
  __i INTEGER NOT NULL DEFAULT 0,
  __d INTEGER NOT NULL DEFAULT 0,

  gsi1pk TEXT,
  gsi1sk TEXT,

  gsi2pk TEXT,
  gsi2sk TEXT,

  gsi3pk TEXT,
  gsi3sk TEXT,

  gsi4pk TEXT,
  gsi4sk TEXT,

  PRIMARY KEY (pk, sk)
);

-- Create index on gsi1pk and gsi1sk combination
CREATE INDEX IF NOT EXISTS ${this.tableName}_idx_gsi1 ON todos(gsi1pk, gsi1sk);
CREATE INDEX IF NOT EXISTS ${this.tableName}_idx_gsi2 ON todos(gsi2pk, gsi2sk);
CREATE INDEX IF NOT EXISTS ${this.tableName}_idx_gsi3 ON todos(gsi3pk, gsi3sk);
CREATE INDEX IF NOT EXISTS ${this.tableName}_idx_gsi4 ON todos(gsi4pk, gsi4sk);

-- Trigger to auto-update updatedAt and __i on UPDATE
CREATE TRIGGER IF NOT EXISTS ${this.tableName}_onupdate_trigger
AFTER UPDATE ON ${this.tableName}
FOR EACH ROW
BEGIN
  UPDATE ${this.tableName}
  SET 
    updatedAt = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    __i = OLD.__i + 1
  WHERE pk = NEW.pk AND sk = NEW.sk;
END;`;
    if (options?.debug) {
      console.log(query);
    }

    return this.sql.exec(query);
  }
}
