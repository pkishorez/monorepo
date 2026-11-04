import type { BackgroundJob } from '@kestack/connect/code';
import { createContext, useContext } from 'react';
import type { Row, ToolState } from './rows.ts';

/*
 * What the transcript knows only live, apart from its Messages: the agent's
 * Background Jobs now, so a background call not yet ended reads as running
 * while its job is listed, and stopped once it is not; how to open a
 * subagent over the page, in a drawer over the ones open, and how deep in
 * them a row is drawn; and how to stop a job.
 */

export interface Live {
  /** The agent's Background Jobs now. */
  readonly jobs: ReadonlyArray<BackgroundJob>;
  /** The jobs asked to stop, until they are gone. */
  readonly stopping: ReadonlyArray<string>;
  /** How many drawers it is drawn in: 0 on the page. */
  readonly depth: number;
  /** Opens a subagent over the drawers below `depth`. */
  readonly open: (id: string, depth: number) => void;
  readonly stop: (jobId: string) => void;
}

const NONE: Live = {
  jobs: [],
  stopping: [],
  depth: 0,
  open: () => {},
  stop: () => {},
};

export const LiveContext = createContext<Live>(NONE);

export const useLive = (): Live => useContext(LiveContext);

type Called = Extract<Row, { readonly kind: 'tool' | 'subagent' }>;

/** The job a call started, while the agent lists it. */
export const jobOf = (
  live: Pick<Live, 'jobs'>,
  row: Called,
): BackgroundJob | undefined =>
  row.job === null
    ? undefined
    : live.jobs.find((job) => job.toolCallId === row.job);

/**
 * Where a call stands now. One left running in a session whose turn has
 * ended was stopped, unless it runs under a Background Job: then it runs
 * on while that job is listed, or while the harness lists jobs without
 * saying which call started them.
 */
export const stateNow = (
  row: Called,
  running: boolean,
  live: Pick<Live, 'jobs'>,
): ToolState => {
  if (row.state !== 'running') return row.state;
  if (running) return 'running';
  if (row.job === null) return 'stopped';
  return live.jobs.some(
    (job) => job.toolCallId === row.job || job.toolCallId === undefined,
  )
    ? 'running'
    : 'stopped';
};

/** A subagent's row, wherever it is nested among `rows`. */
export const subagentIn = (
  rows: ReadonlyArray<Row>,
  id: string,
): Extract<Row, { readonly kind: 'subagent' }> | undefined => {
  for (const row of rows) {
    if (row.kind !== 'subagent') continue;
    if (row.id === id) return row;
    const inner = subagentIn(row.rows, id);
    if (inner !== undefined) return inner;
  }
  return undefined;
};

/** A subagent's row by the call that started it, wherever it is nested. */
export const subagentOf = (
  rows: ReadonlyArray<Row>,
  callId: string,
): Extract<Row, { readonly kind: 'subagent' }> | undefined => {
  for (const row of rows) {
    if (row.kind !== 'subagent') continue;
    if (row.call.id === callId) return row;
    const inner = subagentOf(row.rows, callId);
    if (inner !== undefined) return inner;
  }
  return undefined;
};
