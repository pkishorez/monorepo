import { cpSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const testRoot = dirname(fileURLToPath(import.meta.url));
const fixturesRoot = join(testRoot, 'fixtures', 'schema-snapshots');

export function schemaSnapshotFixture(name: string): string {
  return join(fixturesRoot, name);
}

export function copySchemaSnapshotFixture(
  name: string,
  prefix: string,
): string {
  const target = join(mkdtempSync(join(tmpdir(), prefix)), 'schemas');
  cpSync(schemaSnapshotFixture(name), target, { recursive: true });
  return target;
}
