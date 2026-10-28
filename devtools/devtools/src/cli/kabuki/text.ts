import type {
  Changes,
  Entry,
  History,
  InstanceChange,
  SnapshotView,
} from '@kestack/devtools-kabuki/api';
import type { KabukiSessionSummary } from '@kestack/devtools-kabuki/server';

/*
 * The Kabuki commands as text, for an agent to read: one line per Kabuki
 * Session or History entry, and values as compact JSON.
 */

const date = (millis: number) => new Date(millis).toISOString();

/** A Kabuki Time: how long after init, not a date. */
const appTime = (millis: number) =>
  millis < 1000 ? `${millis.toFixed(1)}ms` : `${(millis / 1000).toFixed(2)}s`;

const json = (value: unknown) =>
  value === undefined ? '(none)' : JSON.stringify(value);

/** The live Kabuki Sessions, one per row. */
export const renderSessionsText = (
  sessions: ReadonlyArray<KabukiSessionSummary>,
) =>
  sessions.length === 0
    ? 'No Kabuki Session is connected. Open the app with ?kabuki-session=<name>.'
    : sessions
        .map((one) =>
          [
            one.name,
            `app ${one.app}`,
            `origin ${one.origin ?? '(none)'}`,
            `connected ${date(one.connectedAt)}`,
            one.url || '(no page)',
          ].join('  '),
        )
        .join('\n');

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
