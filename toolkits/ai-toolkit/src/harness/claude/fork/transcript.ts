import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** What a transcript entry says about where it came from. */
export interface Entry {
  readonly uuid?: unknown;
  /** Set on each entry a fork copied: the entry it was copied from. */
  readonly forkedFrom?: {
    readonly sessionId?: unknown;
    readonly messageUuid?: unknown;
  };
}

/**
 * Where Claude Code keeps a session's JSONL transcript, if it has one,
 * under the config folder `home`, else Claude Code's default.
 */
export const transcriptPath = (
  sessionId: string,
  home?: string,
): string | undefined => {
  const projects = join(
    home ?? process.env['CLAUDE_CONFIG_DIR'] ?? join(homedir(), '.claude'),
    'projects',
  );
  if (!existsSync(projects)) return undefined;
  return readdirSync(projects)
    .map((project) => join(projects, project, `${sessionId}.jsonl`))
    .find(existsSync);
};

/** A session's transcript entries; empty when it has none. */
export const readTranscript = (
  sessionId: string,
  home?: string,
): ReadonlyArray<Entry> => {
  const path = transcriptPath(sessionId, home);
  if (path === undefined) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .flatMap((line): ReadonlyArray<Entry> => {
      if (line.trim() === '') return [];
      try {
        const entry: unknown = JSON.parse(line);
        return typeof entry === 'object' && entry !== null ? [entry] : [];
      } catch {
        return [];
      }
    });
};

/**
 * The entry in a session that stands for `at`. A fork copies every entry
 * under a new uuid, so a Fork Point recorded in the session it came from
 * names its copy through `forkedFrom`, one fork at a time back to the
 * session that wrote it. Undefined when no entry stands for it.
 */
export const resolveEntry = (
  sessionId: string,
  at: string,
  read: (sessionId: string) => ReadonlyArray<Entry>,
  seen: ReadonlySet<string> = new Set(),
): string | undefined => {
  const entries = read(sessionId);
  if (entries.some((entry) => entry.uuid === at)) return at;
  const parent = entries.find(
    (entry) => typeof entry.forkedFrom?.sessionId === 'string',
  )?.forkedFrom?.sessionId;
  if (typeof parent !== 'string' || seen.has(parent)) return undefined;
  const there = resolveEntry(parent, at, read, new Set([...seen, sessionId]));
  if (there === undefined) return undefined;
  const copy = entries.find((entry) => entry.forkedFrom?.messageUuid === there);
  return typeof copy?.uuid === 'string' ? copy.uuid : undefined;
};
