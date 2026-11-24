import { parentPort, workerData } from 'node:worker_threads';

import {
  type Import,
  type PackageReport,
  openProject,
} from '@kestack/monoverse';

/*
 * @kestack/monoverse's engine, in a worker thread: it reads, parses and
 * resolves synchronously, so it runs here, never on the server's own
 * thread. It opens one project, checks the packages asked for, lists the
 * imports of the files asked for, and hands back plain data. Run from
 * source, Node strips its types; the packaged CLI ships it built, beside
 * the CLI, so it imports only packages.
 */

/** What the engine is asked. */
export interface EngineJob {
  /** The folder on disk, absolute. */
  readonly root: string;
  /** Every file of the project, relative to `root`. */
  readonly files: ReadonlyArray<string>;
  /** The packages to check, relative to `root`. */
  readonly packages: ReadonlyArray<string>;
  /** The files whose imports to list. */
  readonly imports: ReadonlyArray<string>;
}

/** What it answers: each package's report, and each file's imports. */
export type EngineAnswer =
  | {
      readonly ok: true;
      readonly reports: ReadonlyArray<PackageReport>;
      readonly imports: ReadonlyArray<readonly [string, ReadonlyArray<Import>]>;
    }
  | { readonly ok: false; readonly error: string };

const job = workerData as EngineJob;
let answer: EngineAnswer;
try {
  const project = openProject({ root: job.root, files: job.files });
  answer = {
    ok: true,
    reports:
      job.packages.length === 0
        ? []
        : project.check({ packages: job.packages }),
    imports: job.imports.map((file) => [file, project.importsOf(file)]),
  };
} catch (cause) {
  answer = { ok: false, error: String(cause) };
}
parentPort?.postMessage(answer);
