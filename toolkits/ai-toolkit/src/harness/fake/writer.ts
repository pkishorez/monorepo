import type { Json } from '../../contract/raw/index.js';
import type {
  AgentQuestion,
  QuestionAnswer,
} from '../../contract/wire/index.js';
import type { HarnessError, RawOut, TurnEnd } from '../contract/index.js';
import type { Ending, Script, Step } from './scripts.js';

/*
 * A Writer: how one harness writes what a Script does, as the records its
 * real agent emits, so the real projection draws them (claude.ts,
 * codex.ts). It only makes records; play.ts says when each goes out, and
 * what waits.
 */

/** Where a Writer writes: one reply of one Agent, or a subagent inside it. */
export interface WriterContext {
  /** The Agent's Native Id: Claude's session id, Codex's thread id. */
  readonly nativeId: string;
  /** This reply's own id, as the harness names its turn. */
  readonly turnId: string;
  readonly cwd: string;
  readonly model: string;
  /** The tool call that spawned the subagent written for; undefined for the main agent. */
  readonly agentId: string | undefined;
  /** A fresh id, unique in this tab, starting `prefix`. */
  readonly id: (prefix: string) => string;
}

export type ToolStep = Extract<
  Step,
  {
    _tag:
      | 'Read'
      | 'Write'
      | 'Edit'
      | 'Delete'
      | 'Bash'
      | 'Search'
      | 'Web'
      | 'Mcp'
      | 'Other';
  }
>;

/** What an Agent Question's step makes: the question, its record, and the records of its answer. */
export interface Asked {
  readonly question: AgentQuestion;
  readonly records: ReadonlyArray<RawOut>;
  /** The records of its answer; null: declined, or let go. */
  readonly answered: (answer: QuestionAnswer | null) => ReadonlyArray<RawOut>;
}

/** What a Background Job's step makes: the job's ids, its records, and the records of its end. */
export interface Started {
  readonly id: string;
  readonly toolCallId: string;
  readonly records: ReadonlyArray<RawOut>;
  /** What the agent writes, between turns, as the job ends. */
  readonly ended: (
    how: 'done' | 'failed' | 'stopped',
    summary: string,
    output: string,
  ) => ReadonlyArray<RawOut>;
}

/** How a reply ends: its last records, then its end, or the error its stream fails with. */
export interface Ended {
  readonly records: ReadonlyArray<RawOut>;
  readonly end: TurnEnd | HarnessError;
}

export interface Writer {
  /** What the harness writes as a reply starts. */
  readonly opens: () => ReadonlyArray<RawOut>;
  /** Streamed text or reasoning: its chunks, then its whole record. */
  readonly text: (
    channel: 'text' | 'reasoning',
    pieces: ReadonlyArray<string>,
  ) => {
    readonly chunks: ReadonlyArray<RawOut>;
    readonly whole: ReadonlyArray<RawOut>;
  };
  /** A tool's call, then its result. */
  readonly tool: (step: ToolStep) => {
    readonly call: ReadonlyArray<RawOut>;
    readonly result: ReadonlyArray<RawOut>;
  };
  readonly plan: (
    step: Extract<Step, { _tag: 'Plan' }>,
  ) => ReadonlyArray<RawOut>;
  /** A subagent's call; its Writer; then the records of its report. */
  readonly subagent: (step: Extract<Step, { _tag: 'Subagent' }>) => {
    readonly call: ReadonlyArray<RawOut>;
    readonly child: Writer;
    readonly report: () => ReadonlyArray<RawOut>;
  };
  readonly ask: (step: Extract<Step, { _tag: 'Ask' }>, now: number) => Asked;
  readonly job: (step: Extract<Step, { _tag: 'Job' }>) => Started;
  readonly compact: () => ReadonlyArray<RawOut>;
  readonly problem: (message: string) => ReadonlyArray<RawOut>;
  /** The end of a reply: as the Script says, or its login gone. */
  readonly ends: (
    ending: Ending | { readonly _tag: 'LoggedOut' },
    usage: Script['usage'],
    /** Everything the reply said, as Claude's result repeats it. */
    said: string,
  ) => Ended;
}

/** Any value as the JSON a record holds. */
export const json = (value: unknown): Json => value as Json;

/** A record of `kind`, from the subagent `agentId` when there is one. */
export const recordOf = (
  kind: string,
  payload: unknown,
  agentId: string | undefined,
): RawOut =>
  agentId === undefined
    ? { kind, payload: json(payload) }
    : { kind, payload: json(payload), agentId };

/**
 * `text` in pieces of about two sentences each, as the harness's Chunker
 * sends them; joined, they are `text` exactly.
 */
export const piecesOf = (text: string): ReadonlyArray<string> => {
  const sentences = text.match(/[^.!?\n]*(?:[.!?]+|\n+|$)\s*/g) ?? [];
  const pieces: Array<string> = [];
  for (let index = 0; index < sentences.length; index += 2) {
    const piece = sentences.slice(index, index + 2).join('');
    if (piece !== '') pieces.push(piece);
  }
  return pieces;
};
