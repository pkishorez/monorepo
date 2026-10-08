import type { ProofLeaf } from 'laymos/story/schema';

import type { ProofReports } from './story-scope';

/** One run: the Proofs it covers, fixed when it begins, and those seen starting. */
export interface Run {
  readonly scope: ReadonlySet<string>;
  /** Proofs of the run seen running, in the order they started. */
  readonly started: readonly string[];
  /** Each Proof's report as it joined the run: a new one means it finished. */
  readonly before: ProofReports;
  /** Runs asked for whose end has not been signalled yet. */
  readonly waiting: number;
  /**
   * Whether a run was asked for that never signals its end: then the run
   * also ends once something started and none of it runs.
   */
  readonly unsignalled: boolean;
  readonly active: boolean;
}

/**
 * A run of `ids` begins: its scope is every one of them from the start, and
 * their reports now are the ones a new report replaces. Run again while a
 * run is under way and the new Proofs join it. `signalled` says whether the
 * caller will call `settleRun` when this run ends.
 */
export function startRun(
  run: Run | undefined,
  ids: readonly string[],
  reports: ProofReports,
  signalled = true,
): Run {
  const ongoing = run?.active === true ? run : undefined;
  const before = { ...ongoing?.before };
  for (const id of ids) {
    if (ongoing?.scope.has(id) !== true && reports[id] !== undefined)
      before[id] = reports[id];
  }
  return {
    scope: new Set([...(ongoing?.scope ?? []), ...ids]),
    started: ongoing?.started ?? [],
    before,
    waiting: (ongoing?.waiting ?? 0) + (signalled ? 1 : 0),
    unsignalled: (ongoing?.unsignalled ?? false) || !signalled,
    active: true,
  };
}

/** The Proofs of the run that are done: no longer running once seen, or with a new report. */
export function finishedOf(
  run: Run | undefined,
  running: ReadonlySet<string>,
  reports: ProofReports,
): ReadonlySet<string> {
  if (run === undefined) return new Set();
  const started = new Set(run.started);
  return new Set(
    [...run.scope].filter(
      (id) =>
        !running.has(id) && (started.has(id) || reports[id] !== run.before[id]),
    ),
  );
}

/** Whether `run` is still under way, from what is running and reported now. */
function stillActive(
  run: Run,
  running: ReadonlySet<string>,
  reports: ProofReports,
): boolean {
  if (finishedOf(run, running, reports).size === run.scope.size) return false;
  if (run.waiting > 0) return true;
  if (!run.unsignalled) return false;
  return run.started.length === 0 || run.started.some((id) => running.has(id));
}

/**
 * Takes in the running Proofs and the reports: those of the run seen
 * running for the first time have started. The run ends once every Proof
 * in it finished, or once its end was signalled.
 */
export function observeRun(
  run: Run | undefined,
  running: ReadonlySet<string>,
  reports: ProofReports,
): Run | undefined {
  if (run?.active !== true) return run;
  const seen = new Set(run.started);
  const fresh = [...running].filter((id) => run.scope.has(id) && !seen.has(id));
  const started = fresh.length === 0 ? run.started : [...run.started, ...fresh];
  const next = fresh.length === 0 ? run : { ...run, started };
  const active = stillActive(next, running, reports);
  return active ? next : { ...next, active };
}

/**
 * One run asked for has ended, finished, failed or interrupted. Once none
 * is waiting the run is over, and Proofs that never finished show their
 * report from before it again.
 */
export function settleRun(
  run: Run | undefined,
  running: ReadonlySet<string>,
  reports: ProofReports,
): Run | undefined {
  if (run?.active !== true) return run;
  const next = { ...run, waiting: Math.max(0, run.waiting - 1) };
  return stillActive(next, running, reports)
    ? next
    : { ...next, active: false };
}

/** What the canvas shows for each Proof while a run may be under way. */
export interface RunDisplay {
  /** The reports to show: none for a Proof of the run not yet finished. */
  readonly reports: ProofReports;
  /** Proofs of the run waiting their turn: not running, not finished. */
  readonly pending: ReadonlySet<string>;
}

const nothing: ReadonlySet<string> = new Set();

/**
 * The reports and pending Proofs to show: while a run is under way, a Proof
 * of it shows no earlier report until it finishes, and one not running yet
 * is pending. Proofs outside the run, and every Proof once it is over,
 * show their latest report.
 */
export function runDisplay(
  run: Run | undefined,
  running: ReadonlySet<string>,
  reports: ProofReports,
): RunDisplay {
  if (run?.active !== true) return { reports, pending: nothing };
  const finished = finishedOf(run, running, reports);
  const unfinished = [...run.scope].filter((id) => !finished.has(id));
  if (unfinished.length === 0) return { reports, pending: nothing };
  const shown = { ...reports };
  for (const id of unfinished) delete shown[id];
  return {
    reports: shown,
    pending: new Set(unfinished.filter((id) => !running.has(id))),
  };
}

export interface Progress {
  /** Proofs in the run that have finished. */
  readonly done: number;
  /** Proofs in the run: fixed from the moment it begins. */
  readonly total: number;
}

/** How far a run has got through `proofs`; only those in its scope count. */
export function progressOf(
  proofs: readonly ProofLeaf[],
  scope: ReadonlySet<string>,
  finished: ReadonlySet<string>,
): Progress {
  let done = 0;
  let total = 0;
  for (const proof of proofs) {
    if (!scope.has(proof.id)) continue;
    total++;
    if (finished.has(proof.id)) done++;
  }
  return { done, total };
}

/**
 * Whether any of `proofs` is running or waiting its turn in a run under way:
 * running them again would only queue them twice.
 */
export function isUnderway(
  proofs: readonly ProofLeaf[],
  run: Run | undefined,
  running: ReadonlySet<string>,
  reports: ProofReports,
): boolean {
  const finished = finishedOf(run, running, reports);
  return proofs.some(
    (proof) =>
      running.has(proof.id) ||
      (run?.active === true &&
        run.scope.has(proof.id) &&
        !finished.has(proof.id)),
  );
}

/** Of `proofs`, the one running that started last, and how many more run. */
export function runningNow(
  proofs: readonly ProofLeaf[],
  run: Run | undefined,
  running: ReadonlySet<string>,
): { readonly proof: ProofLeaf; readonly others: number } | undefined {
  const here = new Map(
    proofs
      .filter((proof) => running.has(proof.id))
      .map((proof) => [proof.id, proof]),
  );
  if (here.size === 0) return undefined;
  const latest =
    run?.started.findLast((id) => here.has(id)) ?? [...here.keys()].at(-1)!;
  return { proof: here.get(latest)!, others: here.size - 1 };
}
