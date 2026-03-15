import { SqliteDBBetterSqlite3 } from "@std-toolkit/sqlite/adapters/better-sqlite3";
import Database from "better-sqlite3";
import { Effect, Layer } from "effect";
import envPaths from "env-paths";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { registry } from "./claude.js";

const makeDbLayer = (dbPath: string) =>
  Layer.unwrapEffect(
    Effect.gen(function* () {
      const db = new Database(dbPath);
      const sqliteLayer = SqliteDBBetterSqlite3(db);
      yield* registry.setup().pipe(Effect.provide(sqliteLayer));
      return sqliteLayer;
    }),
  );

const paths = envPaths("whatever", { suffix: "" });
mkdirSync(paths.data, { recursive: true });

export const dataDir = paths.data;
export const dbLayer = makeDbLayer(join(paths.data, "code.db"));
