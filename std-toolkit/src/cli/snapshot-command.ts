import { randomUUID } from 'node:crypto';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Effect } from 'effect';
import { createJiti } from 'jiti';
import { Snapshot } from '../snapshot/index.js';
import type { ContractSnapshot } from '../snapshot/model.js';

const entryFileName = 'std-toolkit.snapshot.ts';
const baselineFileName = 'std-toolkit.snapshot.json';

export interface SnapshotCommandOptions {
  readonly cwd: string;
  readonly update: boolean;
  readonly write: (output: string) => void;
}

async function decode(input: unknown): Promise<ContractSnapshot> {
  return Effect.runPromise(Snapshot.decode(input));
}

async function loadCurrentSnapshot(cwd: string): Promise<ContractSnapshot> {
  const path = resolve(cwd, entryFileName);
  const jiti = createJiti(import.meta.url, {
    interopDefault: true,
    moduleCache: false,
  });
  const imported = (await jiti.import(path)) as { default?: unknown };
  if (imported.default === undefined) {
    throw new Error(`${entryFileName} must default-export a snapshot`);
  }
  return decode(imported.default);
}

async function loadBaseline(
  cwd: string,
): Promise<ContractSnapshot | undefined> {
  try {
    const source = await readFile(resolve(cwd, baselineFileName), 'utf8');
    return decode(JSON.parse(source));
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') return undefined;
    throw error;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

async function writeBaseline(
  cwd: string,
  snapshot: ContractSnapshot,
): Promise<void> {
  const path = resolve(cwd, baselineFileName);
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(snapshot, null, 2)}\n`, {
      flag: 'wx',
    });
    await rename(temporaryPath, path);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

function renderDiagnostics(snapshot: ContractSnapshot): string | undefined {
  const diagnostics = Snapshot.inspect(snapshot);
  if (diagnostics.length === 0) return undefined;
  return [
    'WARNINGS',
    '',
    ...diagnostics.flatMap((diagnostic, index) => [
      ...(index === 0 ? [] : ['']),
      `  ${diagnostic.message}`,
      `  ${diagnostic.path}`,
    ]),
  ].join('\n');
}

export async function runSnapshotCommand(
  options: SnapshotCommandOptions,
): Promise<number> {
  const [current, baseline] = await Promise.all([
    loadCurrentSnapshot(options.cwd),
    loadBaseline(options.cwd),
  ]);
  const diagnostics = renderDiagnostics(current);
  const contract = Snapshot.render(current);
  const write = (...sections: readonly (string | undefined)[]): void =>
    options.write(
      sections
        .filter((section): section is string => section !== undefined)
        .join('\n\n'),
    );

  if (baseline === undefined) {
    if (!options.update) {
      write(
        `No approved snapshot found: ${baselineFileName}`,
        diagnostics,
        contract,
        `Create it with:\n\n  std-toolkit snapshot -u`,
      );
      return 1;
    }
    await writeBaseline(options.cwd, current);
    write(
      `✓ Approved snapshot written to ${baselineFileName}`,
      diagnostics,
      contract,
    );
    return 0;
  }

  const changes = Snapshot.diff(baseline, current);
  const changeSummary = Snapshot.renderChanges(changes);
  if (changes.length === 0) {
    write(changeSummary, diagnostics, contract);
    return 0;
  }
  if (!options.update) {
    write(
      changeSummary,
      diagnostics,
      contract,
      `Snapshot was not updated.\n\nReview the changes, then approve them with:\n\n  std-toolkit snapshot -u`,
    );
    return 1;
  }
  await writeBaseline(options.cwd, current);
  write(
    `✓ Approved snapshot updated: ${baselineFileName}`,
    changeSummary,
    diagnostics,
    contract,
  );
  return 0;
}
