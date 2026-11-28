import type { HarnessName } from '../../../contract/raw/index.js';
import type { RawOut } from '../../contract/index.js';
import claudeRead from './claude/read.json' with { type: 'json' };
import claudeStream from './claude/stream.json' with { type: 'json' };
import claudeSubagent from './claude/subagent.json' with { type: 'json' };
import codexShell from './codex/shell.json' with { type: 'json' };
import codexStream from './codex/stream.json' with { type: 'json' };
import codexSubagentStreamed from './codex/subagent-streamed.json' with { type: 'json' };
import codexSubagent from './codex/subagent.json' with { type: 'json' };

/*
 * Recordings: every record the real Claude Code or Codex wrote in one
 * Turn, as `pnpm test:e2e` captured it (AI_TOOLKIT_CAPTURE). The Agent
 * fake replays them, and the projection tests read them.
 *
 * `RECORDINGS` are the ones a reply replays: each a whole Turn that ended
 * done. The other files here show one thing the projection must draw, such
 * as a cancelled Turn, a steer or a question, and only its tests read them.
 */

/** The names `ReplyWith` pins a recording by, `random` first. */
export const RECORDING_NAMES = [
  'random',
  'stream',
  'read',
  'shell',
  'subagent',
  'subagent-streamed',
] as const;

const recording = (
  harness: HarnessName,
  name: Recording['name'],
  records: unknown,
): Recording => ({
  harness,
  name,
  records: records as ReadonlyArray<RawOut>,
});

export const RECORDINGS: ReadonlyArray<Recording> = [
  recording('claude', 'stream', claudeStream),
  recording('claude', 'read', claudeRead),
  recording('claude', 'subagent', claudeSubagent),
  recording('codex', 'stream', codexStream),
  recording('codex', 'shell', codexShell),
  recording('codex', 'subagent', codexSubagent),
  recording('codex', 'subagent-streamed', codexSubagentStreamed),
];

/**
 * The recording a reply of `harness` replays: the one `wanted` names, else
 * one of its harness's at random (`random` gives a number in [0, 1)).
 */
export const recordingFor = (
  harness: HarnessName,
  wanted: RecordingName,
  random: () => number = Math.random,
): Recording => {
  const own = RECORDINGS.filter((each) => each.harness === harness);
  return (
    own.find((each) => each.name === wanted) ??
    own[Math.floor(random() * own.length)]!
  );
};

/** The temporary folder an e2e run worked in, as each harness wrote it. */
const RECORDED_CWD =
  /(?:\/private)?\/var\/folders\/[^"/\\]+\/[^"/\\]+\/T\/ai-toolkit-(?:claude|codex)-e2e-[A-Za-z0-9]+/g;
/** The home folder of whoever recorded it. */
const RECORDED_HOME = /\/Users\/[^"/\\]+/g;

/** The main agent's ids in a recording: Claude's session, Codex's thread and turn. */
const idsOf = (records: ReadonlyArray<RawOut>) => {
  for (const record of records) {
    if (record.agentId !== undefined) continue;
    const payload = record.payload as Readonly<Record<string, unknown>>;
    if (typeof payload['session_id'] === 'string')
      return { native: payload['session_id'], turn: undefined };
    if (typeof payload['threadId'] === 'string')
      return {
        native: payload['threadId'],
        turn:
          typeof payload['turnId'] === 'string' ? payload['turnId'] : undefined,
      };
  }
  return { native: undefined, turn: undefined };
};

/**
 * A recording's records as if this Agent wrote them now: its ids, folder
 * and home in place of the recorded ones; the rest exactly as recorded.
 */
export const replayed = (
  { records }: Recording,
  into: ReplayedIn,
): ReadonlyArray<RawOut> => {
  const ids = idsOf(records);
  return records.map((record) => {
    let text = JSON.stringify(record.payload)
      .replace(RECORDED_CWD, into.cwd)
      .replace(RECORDED_HOME, into.home);
    if (ids.native !== undefined)
      text = text.replaceAll(ids.native, into.nativeId);
    if (ids.turn !== undefined) text = text.replaceAll(ids.turn, into.turnId);
    return { ...record, payload: JSON.parse(text) as RawOut['payload'] };
  });
};

export type RecordingName = (typeof RECORDING_NAMES)[number];
export interface Recording {
  readonly harness: HarnessName;
  readonly name: Exclude<RecordingName, 'random'>;
  readonly records: ReadonlyArray<RawOut>;
}
/** Where a replay runs: the Agent, the Turn and the folders it shows. */
export interface ReplayedIn {
  /** The Agent's Native Id: Claude's session id, Codex's thread id. */
  readonly nativeId: string;
  /** The Turn's id, as Codex names it. */
  readonly turnId: string;
  readonly cwd: string;
  readonly home: string;
}
