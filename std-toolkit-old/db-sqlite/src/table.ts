import type { SqlStorage } from '@cloudflare/workers-types';
import { sql } from './utils.js';
import { IndexDefinition } from './types.js';

export class SqliteTable<IndexMap extends Record<string, IndexDefinition>> {
  static make(tableName: string, execSql: SqlStorage) {
    return new Builder<{}>(tableName, execSql, {});
  }

  readonly tableName: string;
  readonly sql: SqlStorage;
  readonly indexMap: IndexMap;

  constructor(tableName: string, indexMap: IndexMap, execSql: SqlStorage) {
    this.tableName = tableName;
    this.indexMap = indexMap;
    this.sql = execSql;
  }

  private getExistingColumns(): Set<string> {
    const result = this.sql
      .exec(`PRAGMA table_info(${this.tableName});`)
      .toArray();
    const columns = new Set<string>();

    for (const column of result) {
      columns.add(column.name as string);
    }

    return columns;
  }

  setupTable(options?: { debug?: boolean }) {
    // Create base table with core columns only
    const createTableQuery = sql`
CREATE TABLE IF NOT EXISTS ${this.tableName} (
  pk TEXT,
  sk TEXT,
  data TEXT,

  _e TEXT,
  _v TEXT,
  _i INTEGER NOT NULL DEFAULT 0,
  _d INTEGER NOT NULL DEFAULT 0,
  _u TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

  PRIMARY KEY (pk, sk)
);`;

    if (options?.debug) {
      console.log(createTableQuery);
    }

    // Execute table creation
    this.sql.exec(createTableQuery);

    // Get existing columns to check before adding new ones
    const existingColumns = this.getExistingColumns();

    // Dynamically add columns and indices based on indexMap
    const alterStatements: string[] = [];

    for (const [indexName, { pk: pkColumn, sk: skColumn }] of Object.entries(
      this.indexMap,
    )) {
      const idxName = indexName.toLowerCase();

      // Add pk column only if it doesn't exist
      if (!existingColumns.has(pkColumn)) {
        alterStatements.push(
          sql`ALTER TABLE ${this.tableName} ADD COLUMN ${pkColumn} TEXT;`,
        );
      }

      // Add sk column only if it doesn't exist
      if (!existingColumns.has(skColumn)) {
        alterStatements.push(
          sql`ALTER TABLE ${this.tableName} ADD COLUMN ${skColumn} TEXT;`,
        );
      }

      // Create index on pk, sk combination
      alterStatements.push(
        sql`CREATE INDEX IF NOT EXISTS ${this.tableName}_idx_${idxName} ON ${this.tableName}(${pkColumn}, ${skColumn});`,
      );
    }

    // Execute ALTER TABLE statements if any
    if (alterStatements.length > 0) {
      const alterQuery = alterStatements.join('\n\n');
      if (options?.debug) {
        console.log(alterQuery);
      }
      this.sql.exec(alterQuery);
    }

    // Create trigger to auto-update _u and _i on UPDATE
    const triggerQuery = sql`
CREATE TRIGGER IF NOT EXISTS ${this.tableName}_onupdate_trigger
AFTER UPDATE ON ${this.tableName}
FOR EACH ROW
BEGIN
  UPDATE ${this.tableName}
  SET
    _u = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    _i = OLD._i + 1
  WHERE pk = NEW.pk AND sk = NEW.sk;
END;`;

    if (options?.debug) {
      console.log(triggerQuery);
    }

    return this.sql.exec(triggerQuery);
  }
}

class Builder<IndexMap extends Record<string, IndexDefinition>> {
  constructor(
    private tableName: string,
    private execSql: SqlStorage,
    private indexMap: IndexMap,
  ) {}

  stdIndex<Name extends string>(
    name: Name,
    pk: string,
  ): Builder<IndexMap & { [K in Name]: IndexDefinition }> {
    return new Builder(this.tableName, this.execSql, {
      ...this.indexMap,
      [name]: {
        pk,
        sk: '_u',
      } as IndexDefinition,
    });
  }

  index<Name extends string>(name: Name, def: IndexDefinition) {
    return new Builder<IndexMap & { [K in Name]: IndexDefinition }>(
      this.tableName,
      this.execSql,
      {
        ...this.indexMap,
        [name]: def,
      },
    );
  }

  build() {
    return new SqliteTable<IndexMap>(
      this.tableName,
      this.indexMap,
      this.execSql,
    );
  }
}
