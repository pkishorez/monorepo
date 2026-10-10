import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Effect, Option } from 'effect';
import type { CapturedTrace as RecordedTrace } from '@kstackz/effect-tracer/recorder';

import type { Proof, ProofHost } from '../../story/index.js';
import type {
  CapturedTrace,
  JsonValue,
  PhaseName,
  PhaseReport,
  ProofAssertion,
  ProofReport,
  ProofVerdict,
} from '../../story/schema/index.js';
import type {
  BrowserSession,
  BrowserVenue,
} from './browser-venue/browser-venue.js';
import { startProofClock, type ProofClock } from './proof-clock.js';
import { toJsonValue } from './to-json-value.js';

export interface PlannedProof {
  readonly id: string;
  readonly proof: Proof;
  readonly projectRoot: string;
  /** Milliseconds. */
  readonly timeout: number;
}

export function evidenceFolder(projectRoot: string, id: string): string {
  return join(projectRoot, '.laymos', 'stories', ...id.split('/'));
}

/** Runs one Proof into a fresh Evidence folder and writes its `report.json`. */
export function runProof(
  planned: PlannedProof,
  browserVenue: Effect.Effect<BrowserVenue, string>,
): Effect.Effect<ProofReport> {
  return Effect.gen(function* () {
    const folder = evidenceFolder(planned.projectRoot, planned.id);
    yield* Effect.promise(async () => {
      await rm(folder, { recursive: true, force: true });
      await mkdir(folder, { recursive: true });
    });
    const clock = startProofClock();
    const phases = trackPhases(clock);
    let session: BrowserSession | null = null;
    let error: string | undefined;

    if (planned.proof.venue === 'browser') {
      const venue = yield* Effect.result(browserVenue);
      if (venue._tag === 'Failure') {
        error = venue.failure;
      } else {
        session = venue.success.session(planned.id, {
          folder,
          clock,
          phase: phases.current,
        });
      }
    }

    if (error === undefined) {
      const host: ProofHost = {
        ...phases.host,
        browser: session?.host ?? null,
      };
      const ran = yield* Effect.tryPromise({
        try: (signal) => planned.proof.run(host, signal),
        catch: (cause) =>
          cause instanceof Error ? cause.message : String(cause),
      }).pipe(Effect.timeoutOption(planned.timeout), Effect.result);
      if (ran._tag === 'Failure') {
        error = ran.failure;
      } else if (Option.isNone(ran.success)) {
        error = `Proof timed out after ${planned.timeout}ms`;
      }
    }

    const evidence =
      session === null
        ? { steps: [], recordings: [] }
        : yield* Effect.promise(session.close);
    const duration = clock.now();
    const phaseReports = phases.close(duration, error);
    const trace = phases.trace();
    const report: ProofReport = {
      id: planned.id,
      verdict: verdictOf(phaseReports, error),
      startedAt: Math.round(clock.startedAt),
      duration,
      ...(error === undefined ? {} : { error }),
      phases: phaseReports,
      trace,
      steps: evidence.steps,
      recordings: evidence.recordings,
    };
    yield* Effect.promise(() =>
      writeFile(join(folder, 'report.json'), JSON.stringify(report, null, 2)),
    );
    return report;
  });
}

interface OpenPhase {
  readonly phase: PhaseName;
  readonly startedAt: number;
  readonly assertions: ProofAssertion[];
  endedAt?: number;
  outcome?:
    | { readonly _tag: 'Success'; readonly value: JsonValue }
    | { readonly _tag: 'Failure'; readonly error: string };
}

/** Collects what a Proof reports through its host until the run is closed; anything later is ignored. */
function trackPhases(clock: ProofClock) {
  const opened: OpenPhase[] = [];
  let snapshot: (() => RecordedTrace) | null = null;
  let closed = false;

  const host: Omit<ProofHost, 'browser'> = {
    trace: (take) => {
      snapshot = take;
    },
    enter: (phase) => {
      if (!closed)
        opened.push({ phase, startedAt: clock.now(), assertions: [] });
    },
    assert: (description, passed) => {
      if (!closed) opened.at(-1)?.assertions.push({ description, passed });
    },
    exit: (phase, outcome) => {
      const open = opened.at(-1);
      if (closed || open === undefined || open.phase !== phase) return;
      open.endedAt = clock.now();
      // Kept as it was when the phase ended; finalizers may change it later.
      open.outcome =
        outcome._tag === 'Success'
          ? { _tag: 'Success', value: toJsonValue(outcome.value) }
          : outcome;
    },
  };

  return {
    host,
    current: (): PhaseName => opened.at(-1)?.phase ?? 'prepare',
    trace: (): CapturedTrace | null =>
      snapshot === null ? null : capture(snapshot()),
    close: (endedAt: number, error: string | undefined): PhaseReport[] => {
      closed = true;
      return (['prepare', 'act', 'verify'] as const).map((phase) => {
        const open = opened.find((candidate) => candidate.phase === phase);
        if (open === undefined) {
          return {
            phase,
            status: 'skipped',
            startedAt: endedAt,
            endedAt,
            assertions: [],
          };
        }
        const base = {
          phase,
          startedAt: open.startedAt,
          endedAt: open.endedAt ?? endedAt,
          assertions: open.assertions,
        };
        if (open.outcome === undefined) {
          return {
            ...base,
            status: 'errored',
            error: error ?? 'The phase never ended',
          };
        }
        if (open.outcome._tag === 'Failure') {
          return { ...base, status: 'errored', error: open.outcome.error };
        }
        return {
          ...base,
          status: open.assertions.every(({ passed }) => passed)
            ? 'passed'
            : 'failed',
          value: open.outcome.value,
        };
      });
    },
  };
}

/** Keeps only what the report schema carries. */
function capture(trace: RecordedTrace): CapturedTrace {
  return {
    spans: trace.spans.map(
      ({
        traceId,
        spanId,
        parentSpanId,
        name,
        startTime,
        endTime,
        status,
        attributes,
        events,
      }) => ({
        traceId,
        spanId,
        parentSpanId,
        name,
        startTime,
        endTime,
        status,
        attributes,
        events,
      }),
    ),
    logs: trace.logs.map(
      ({ id, spanId, timestamp, level, message, annotations }) => ({
        id,
        spanId,
        timestamp,
        level,
        message,
        annotations,
      }),
    ),
    truncated: trace.truncated,
  };
}

function verdictOf(
  phases: readonly PhaseReport[],
  error: string | undefined,
): ProofVerdict {
  const status = (phase: PhaseName) =>
    phases.find((report) => report.phase === phase)?.status;
  if (error !== undefined) return 'errored';
  if (status('prepare') !== 'passed') return 'unprepared';
  if (status('act') === 'errored' || status('verify') === 'errored') {
    return 'errored';
  }
  if (status('act') === 'failed' || status('verify') === 'failed') {
    return 'failed';
  }
  return 'passed';
}
