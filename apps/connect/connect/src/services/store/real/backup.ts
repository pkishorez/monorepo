import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const KEEP = 3;

const PREFIX = 'ke-connect.';

export const backupName = (version: string) => `${PREFIX}${version}.db`;

const safe = (version: string) => version.replace(/[^A-Za-z0-9._-]/g, '_');

export const backUp = (db: string, folder: string, version: string) => {
  if (!existsSync(db) || statSync(db).size === 0) return null;
  const file = join(folder, backupName(safe(version)));
  if (existsSync(file)) return null;
  mkdirSync(folder, { recursive: true, mode: 0o700 });
  const source = new DatabaseSync(db, { readOnly: true });
  try {
    source.exec(`VACUUM INTO '${file.replaceAll("'", "''")}'`);
  } finally {
    source.close();
  }
  const kept = readdirSync(folder)
    .filter((name) => name.startsWith(PREFIX) && name.endsWith('.db'))
    .map((name) => ({ name, at: statSync(join(folder, name)).mtimeMs }))
    .sort((a, b) => b.at - a.at);
  for (const old of kept.slice(KEEP)) rmSync(join(folder, old.name));
  return file;
};
