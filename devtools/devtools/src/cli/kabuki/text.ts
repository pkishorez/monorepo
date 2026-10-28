import type {
  Changes,
  Entry,
  History,
  InstanceChange,
  SnapshotView,
} from '@kestack/devtools-kabuki/api';
import { grouped } from '@kestack/devtools-kabuki/server';
import type {
  AppGroup,
  KabukiSessionSummary,
} from '@kestack/devtools-kabuki/server';

/*
 * The Kabuki commands as text, for an agent to read: the Kabuki Sessions
 * as a tree, app, Environment, then one line each; one line per History
 * entry; and values as compact JSON.
 */

const date = (millis: number) => new Date(millis).toISOString();

/** A Kabuki Time: how long after init, not a date. */
const appTime = (millis: number) =>
  millis < 1000 ? `${millis.toFixed(1)}ms` : `${(millis / 1000).toFixed(2)}s`;

const json = (value: unknown) =>
  value === undefined ? '(none)' : JSON.stringify(value);

/** The live Kabuki Sessions by app, then Environment, as `sessions` prints them. */
export interface SessionsTree {
  readonly apps: ReadonlyArray<AppGroup<KabukiSessionSummary>>;
}

/** The Kabuki Sessions grouped into a tree. */
export const sessionsTree = (
  sessions: ReadonlyArray<KabukiSessionSummary>,
): SessionsTree => ({ apps: grouped(sessions) });

/** A Kabuki Session's page under its Environment: the path alone where the Environment is the page's host. */
const pageText = (url: string, environment: string) => {
  if (url === '') return '(no page)';
  try {
    const { host, pathname } = new URL(url);
    return host === environment ? pathname : `${host}${pathname}`;
  } catch {
    return url;
  }
};

/** The live Kabuki Sessions as a tree: each app, each of its Environments, then one row per Kabuki Session. */
export const renderSessionsText = ({ apps }: SessionsTree) => {
  if (apps.length === 0)
    return 'No Kabuki Session is connected. Attach `connect` from @kestack/devtools-kabuki/session to a running app.';
  const lines: Array<string> = [];
  for (const { app, environments } of apps) {
    lines.push(app);
    for (const { environment, sessions } of environments) {
      lines.push(`  ${environment}`);
      const width = Math.max(...sessions.map((one) => one.name.length));
      for (const one of sessions)
        lines.push(
          [
            `    ${one.name.padEnd(width)}`,
            pageText(one.url, environment),
            `connected ${date(one.connectedAt)}`,
          ].join('  '),
        );
    }
  }
  return lines.join('\n');
};

const sourceText = (source: Entry['source']) => {
  switch (source.kind) {
    case 'view':
    case 'provide':
      return `${source.kind} ${source.instance}`;
    case 'command':
      return `command ${source.instance}/${source.name}`;
    case 'worker':
      return `worker ${source.instance}/${source.name}${source.key === undefined ? '' : `#${source.key}`}`;
    case 'outside':
      return source.name === undefined ? 'outside' : `outside ${source.name}`;
    case 'restore':
      return 'restore';
  }
};

/** One History entry: id, tag, destination, source, outcome, and its Time after init. */
export const entryLine = (entry: Entry) =>
  [
    `#${entry.id}`,
    entry.tag,
    `→ ${entry.destination}`,
    `from ${sourceText(entry.source)}`,
    entry.outcome,
    `at ${appTime(entry.at)}`,
  ].join('  ');

/** The Head's Branch: where the app is, then one line per entry, oldest first. */
export const renderHistoryText = (history: History) => {
  const where = [
    `head ${history.head === null ? 'init' : `#${history.head}`}`,
    `${history.size} entries kept`,
    history.shown === null ? 'live' : `showing ${history.shown}`,
    history.running ? 'running' : 'stopped',
  ];
  const lines = [where.join(' · ')];
  if (history.failure !== null) lines.push(`failure: ${history.failure}`);
  if (history.entries.length === 0) lines.push('(no entries)');
  for (const entry of history.entries) lines.push(entryLine(entry));
  return lines.join('\n');
};

const changeLines = (change: InstanceChange) => {
  const sign = { added: '+', removed: '-', changed: '~' }[change.kind];
  const lines = [`${sign} ${change.instance} (${change.actor})`];
  if (change.state !== undefined)
    lines.push(`    state ${change.state[0]} → ${change.state[1]}`);
  for (const [part, values] of [
    ['model', change.model],
    ['props', change.props],
  ] as const) {
    for (const value of values)
      lines.push(
        `    ${part} ${value.path}: ${json(value.from)} → ${json(value.to)}`,
      );
  }
  if (change.started.length > 0)
    lines.push(`    started ${change.started.join(', ')}`);
  if (change.stopped.length > 0)
    lines.push(`    stopped ${change.stopped.join(', ')}`);
  return lines;
};

/** What one Step did: its entry, the Commands it asked for, each Instance it changed. */
export const renderChangesText = (changes: Changes) =>
  [
    entryLine(changes.entry),
    `message ${json(changes.entry.message)}`,
    `commands ${changes.commands.length === 0 ? '(none)' : changes.commands.join(', ')}`,
    ...(changes.changes.length === 0
      ? ['(no Instance changed)']
      : changes.changes.flatMap(changeLines)),
  ].join('\n');

/** A Snapshot, or part of one, as indented JSON under where it was read. */
export const renderSnapshotText = (view: SnapshotView) =>
  [
    [
      `at ${view.at}`,
      `path ${view.path || '(the whole Snapshot)'}`,
      ...(view.summarized ? ['summarized: pass --expand for all of it'] : []),
    ].join(' · '),
    JSON.stringify(view.value, null, 2) ?? '(none)',
  ].join('\n');
