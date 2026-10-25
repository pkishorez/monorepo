import type { Part } from '@kestack/connect/code';
import type { Row, ToolState } from './thread.ts';

/*
 * A tool call as a person scans it: a verb and what it acted on ("Read
 * math.ts", "Ran pnpm test", "Edited math.ts +3 −1"), paths relative to the
 * project's folder; an edit as the diff it made; and runs of calls of one
 * kind folded into one line ("Read 3 files"). Claude and Codex name their
 * inputs differently, so each reader below knows both.
 */

type Call = Extract<Part, { readonly type: 'toolCall' }>;
type ToolRow = Extract<Row, { readonly kind: 'tool' }>;

const field = (input: unknown, key: string): string | undefined => {
  if (typeof input !== 'object' || input === null) return undefined;
  const value = (input as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
};

/** A path inside the folder, relative to it; macOS's `/private/tmp` is `/tmp`. */
export const relative = (path: string, folder: string | null): string => {
  if (folder === null) return path;
  const plain = (each: string) =>
    each.replace(/^\/private(?=\/(tmp|var)\/)/, '').replace(/\/+$/, '');
  const base = plain(folder);
  const full = plain(path);
  if (full === base) return '.';
  return full.startsWith(`${base}/`) ? full.slice(base.length + 1) : path;
};

/** The command a shell call ran, without Codex's `bash -lc '…'` wrapper. */
export const commandOf = (call: Call): string => {
  const command = field(call.input, 'command');
  if (command === undefined) return call.title;
  const wrapped = /^\S*\b(?:ba|z)?sh -lc (['"])([\s\S]*)\1$/.exec(command);
  if (wrapped === null) return command;
  const inner = wrapped[2] ?? '';
  return wrapped[1] === "'" ? inner.replaceAll(`'\\''`, `'`) : inner;
};

type Change = {
  readonly path: string;
  readonly diff: string;
  readonly kind: string;
};

/** Codex's file changes, each with its path, its unified diff and its kind. */
const changesOf = (call: Call): ReadonlyArray<Change> => {
  const changes = (call.input as { changes?: unknown } | null)?.changes;
  if (!Array.isArray(changes)) return [];
  return changes.flatMap((change: unknown): Change[] => {
    const path = field(change, 'path');
    if (path === undefined) return [];
    const kind = (change as { kind?: { type?: unknown } }).kind?.type;
    return [
      {
        path,
        diff: field(change, 'diff') ?? '',
        kind: typeof kind === 'string' ? kind : 'update',
      },
    ];
  });
};

/** The files a call touched, as they were named. */
const pathsOf = (call: Call): ReadonlyArray<string> => {
  const changed = changesOf(call).map(({ path }) => path);
  if (changed.length > 0) return changed;
  const path =
    field(call.input, 'file_path') ??
    field(call.input, 'notebook_path') ??
    field(call.input, 'path');
  return path === undefined ? [] : [path];
};

export type DiffLine = {
  readonly kind: 'context' | 'added' | 'removed';
  readonly content: string;
  readonly oldNumber?: number;
  readonly newNumber?: number;
};
export type Hunk = {
  readonly header: string;
  readonly oldStart: number;
  readonly newStart: number;
  readonly lines: ReadonlyArray<DiffLine>;
};
export type FileDiff = {
  readonly path: string;
  readonly hunks: ReadonlyArray<Hunk>;
};

const lines = (text: string) =>
  text === '' ? [] : text.replace(/\n$/, '').split('\n');

/** The lines that changed from one text to another, by their longest common run. */
export const diffText = (
  before: string,
  after: string,
): ReadonlyArray<DiffLine> => {
  const a = lines(before);
  const b = lines(after);
  const common: number[][] = Array.from({ length: a.length + 1 }, () =>
    Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      common[i]![j] =
        a[i] === b[j]
          ? common[i + 1]![j + 1]! + 1
          : Math.max(common[i + 1]![j]!, common[i]![j + 1]!);
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      out.push({
        kind: 'context',
        content: a[i]!,
        oldNumber: i + 1,
        newNumber: j + 1,
      });
      i++;
      j++;
    } else if (
      i < a.length &&
      (j === b.length || common[i + 1]![j]! >= common[i]![j + 1]!)
    ) {
      out.push({ kind: 'removed', content: a[i]!, oldNumber: i + 1 });
      i++;
    } else {
      out.push({ kind: 'added', content: b[j]!, newNumber: j + 1 });
      j++;
    }
  }
  return out;
};

/** A unified diff's hunks, numbered from each `@@` header. */
export const parseUnified = (patch: string): ReadonlyArray<Hunk> => {
  const hunks: Hunk[] = [];
  let current: {
    header: string;
    oldStart: number;
    newStart: number;
    lines: DiffLine[];
  } | null = null;
  let old = 0;
  let next = 0;
  for (const line of patch.split('\n')) {
    const header = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (header) {
      old = Number(header[1]);
      next = Number(header[2]);
      current = { header: line, oldStart: old, newStart: next, lines: [] };
      hunks.push(current);
    } else if (current === null || line.startsWith('\\')) continue;
    else if (line.startsWith('+'))
      current.lines.push({
        kind: 'added',
        content: line.slice(1),
        newNumber: next++,
      });
    else if (line.startsWith('-'))
      current.lines.push({
        kind: 'removed',
        content: line.slice(1),
        oldNumber: old++,
      });
    else if (line.startsWith(' '))
      current.lines.push({
        kind: 'context',
        content: line.slice(1),
        oldNumber: old++,
        newNumber: next++,
      });
  }
  return hunks;
};

const hunkOf = (body: ReadonlyArray<DiffLine>): Hunk => {
  const oldStart =
    body.find((line) => line.oldNumber !== undefined)?.oldNumber ?? 1;
  const newStart =
    body.find((line) => line.newNumber !== undefined)?.newNumber ?? 1;
  return {
    header: `@@ -${oldStart} +${newStart} @@`,
    oldStart,
    newStart,
    lines: body,
  };
};

/** The diffs an edit made, one per file, when its input holds them. */
export const diffsOf = (
  call: Call,
  folder: string | null,
): ReadonlyArray<FileDiff> => {
  if (call.tool !== 'edit' && call.tool !== 'write') return [];
  const changes = changesOf(call).filter(({ diff }) => /^@@ /m.test(diff));
  if (changes.length > 0)
    return changes.map(({ path, diff }) => ({
      path: relative(path, folder),
      hunks: parseUnified(diff),
    }));
  const path = pathsOf(call)[0];
  if (path === undefined || call.tool !== 'edit') return [];
  const input = call.input as { edits?: unknown } | null;
  const edits = Array.isArray(input?.edits) ? input.edits : [call.input];
  const hunks = edits.flatMap((edit: unknown) => {
    const before = field(edit, 'old_string') ?? '';
    const after = field(edit, 'new_string') ?? '';
    return before === '' && after === ''
      ? []
      : [hunkOf(diffText(before, after))];
  });
  return hunks.length === 0 ? [] : [{ path: relative(path, folder), hunks }];
};

/** Lines added and removed across diffs. */
export const counted = (diffs: ReadonlyArray<FileDiff>) => {
  let added = 0;
  let removed = 0;
  for (const { hunks } of diffs)
    for (const { lines: body } of hunks)
      for (const line of body)
        if (line.kind === 'added') added++;
        else if (line.kind === 'removed') removed++;
  return { added, removed };
};

const VERBS: Record<Call['tool'], readonly [done: string, running: string]> = {
  read: ['Read', 'Reading'],
  write: ['Wrote', 'Writing'],
  edit: ['Edited', 'Editing'],
  delete: ['Deleted', 'Deleting'],
  bash: ['Ran', 'Running'],
  search: ['Searched', 'Searching'],
  web: ['Fetched', 'Fetching'],
  subagent: ['Asked', 'Asking'],
  todo: ['Updated', 'Updating'],
  mcp: ['Called', 'Calling'],
  other: ['', ''],
};

export type Summary = {
  /** What it did, in the tense of its state: "Read", "Running". Empty when unknown. */
  readonly verb: string;
  /** What it did it to: a path, a command, a pattern. */
  readonly target: string;
  /** A command or a pattern: drawn as code. */
  readonly code: boolean;
  /** Lines an edit added and removed. */
  readonly lines: { readonly added: number; readonly removed: number } | null;
};

const paths = (call: Call, folder: string | null) => {
  const all = pathsOf(call).map((path) => relative(path, folder));
  return all.length <= 1
    ? (all[0] ?? call.title)
    : `${all[0]} and ${all.length - 1} more`;
};

/** One tool call as a line: its verb and its target. */
export const summary = (
  call: Call,
  state: ToolState,
  folder: string | null,
): Summary => {
  const verb = VERBS[call.tool][state === 'running' ? 1 : 0];
  const plain = { verb, code: false, lines: null };
  switch (call.tool) {
    case 'read':
    case 'write':
    case 'delete':
      return { ...plain, target: paths(call, folder) };
    case 'edit': {
      const diffs = diffsOf(call, folder);
      return {
        ...plain,
        target: paths(call, folder),
        lines: diffs.length > 0 ? counted(diffs) : null,
      };
    }
    case 'bash':
      return {
        ...plain,
        target: commandOf(call).split('\n')[0] ?? '',
        code: true,
      };
    case 'search': {
      const pattern =
        field(call.input, 'pattern') ?? field(call.input, 'query');
      const where = field(call.input, 'path');
      if (pattern === undefined)
        return {
          ...plain,
          target: where ? relative(where, folder) : call.title,
        };
      const inside = where === undefined ? '.' : relative(where, folder);
      const place = inside === '.' ? '' : ` in ${inside}`;
      return { ...plain, target: `${pattern}${place}`, code: true };
    }
    case 'web': {
      const url = field(call.input, 'url');
      return url !== undefined
        ? { ...plain, target: url }
        : {
            ...plain,
            verb:
              state === 'running'
                ? 'Searching the web for'
                : 'Searched the web for',
            target: call.title,
          };
    }
    case 'todo':
      return { ...plain, target: 'the to-do list' };
    default:
      return { ...plain, target: call.title || call.name };
  }
};

const NOUNS: Record<Call['tool'], readonly [one: string, many: string]> = {
  read: ['file', 'files'],
  write: ['file', 'files'],
  edit: ['file', 'files'],
  delete: ['file', 'files'],
  bash: ['command', 'commands'],
  search: ['search', 'searches'],
  web: ['page', 'pages'],
  subagent: ['subagent', 'subagents'],
  todo: ['list', 'lists'],
  mcp: ['tool', 'tools'],
  other: ['tool', 'tools'],
};

/** A run of calls of one kind: "Read 3 files", "Ran 2 commands". */
export const groupTitle = (rows: ReadonlyArray<ToolRow>): string => {
  const tool = rows[0]?.call.tool ?? 'other';
  const running = rows.some((row) => row.state === 'running');
  const verb =
    tool === 'search'
      ? running
        ? 'Running'
        : 'Ran'
      : tool === 'other' || tool === 'mcp'
        ? running
          ? 'Using'
          : 'Used'
        : VERBS[tool][running ? 1 : 0];
  return `${verb} ${rows.length} ${NOUNS[tool][1]}`;
};

export type Item =
  | { readonly kind: 'row'; readonly row: Row }
  | {
      readonly kind: 'group';
      readonly id: string;
      readonly rows: ReadonlyArray<ToolRow>;
    };

/** Rows with each run of two or more tool calls of one kind folded into a group. */
export const grouped = (rows: ReadonlyArray<Row>): ReadonlyArray<Item> => {
  const items: Item[] = [];
  let run: ToolRow[] = [];
  const flush = () => {
    if (run.length >= 2)
      items.push({ kind: 'group', id: `${run[0]!.id}:group`, rows: run });
    else for (const row of run) items.push({ kind: 'row', row });
    run = [];
  };
  for (const row of rows) {
    if (
      row.kind === 'tool' &&
      (run.length === 0 || run[0]!.call.tool === row.call.tool)
    ) {
      run.push(row);
      continue;
    }
    flush();
    if (row.kind === 'tool') run.push(row);
    else items.push({ kind: 'row', row });
  }
  flush();
  return items;
};

/** Why a call failed, in one line: the first line of its output that says something. */
export const reasonOf = (output: string): string => {
  const line =
    output
      .replace(/<\/?tool_use_error>/g, '')
      .split('\n')
      .map((each) => each.trim())
      .find((each) => each !== '') ?? '';
  return line.length > 160 ? `${line.slice(0, 159)}…` : line;
};
