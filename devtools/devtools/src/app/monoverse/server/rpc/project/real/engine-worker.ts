import { parentPort, workerData } from 'node:worker_threads';

import {
  type Import,
  type PackageReport,
  openProject,
} from '@kestack/monoverse';

export interface EngineJob {
  readonly root: string;
  readonly files: ReadonlyArray<string>;
  readonly packages: ReadonlyArray<string>;
  readonly imports: ReadonlyArray<string>;
}

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
