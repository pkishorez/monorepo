import type { Connection as ConnectionSchema } from '@kestack/connect/cloud';
import { Button } from '@kestack/web-platform/ui/components/button';
import { CheckIcon, CircleAlertIcon, CopyIcon } from 'lucide-react';
import { Progress } from '@kestack/web-platform/ui/components/progress';
import { useState } from 'react';
import type { Behind } from '../reach/index.ts';
import {
  outdated,
  type PluginNotice,
  pluginNotice,
  UPDATE_COMMAND,
} from './health.ts';

type Connection = typeof ConnectionSchema.Type;

/*
 * What the app says of a Connection's own programs, linked or not: its
 * code Plugin Updating, with how far it downloaded, or Crashed, with its
 * last lines to read and copy and when it is tried again; this Code moving
 * to its newest build, when the Connection runs a newer Release than it
 * calls; and, when the Connection is Outdated, its `ke-connect` older than
 * Cloud Connect accepts, how to update it. A running Plugin on a
 * `ke-connect` Cloud Connect accepts says nothing. The header's pill says
 * it in a few words, and Settings in full.
 */

type Pill = readonly [label: string, title: string, tone: string];

const megabytes = (bytes: number) => `${(bytes / 1_000_000).toFixed(1)} MB`;

/** How far the download is, in whole percent; null while the total is not known. */
const percentOf = (
  progress: Extract<PluginNotice, { _tag: 'Updating' }>['progress'],
) =>
  progress === null || progress.total === null || progress.total === 0
    ? null
    : Math.min(100, Math.floor((progress.received / progress.total) * 100));

/** When the Plugin is tried again, said for a person. */
export const retryIn = (retryAt: number, now: number) => {
  const seconds = Math.ceil((retryAt - now) / 1000);
  return seconds <= 0 ? 'now' : `in ${seconds} s`;
};

/** What the pill says of the code Plugin or `ke-connect`, more on hover, and its colour; null when there is nothing to say. */
export const noticePillOf = (
  connection: Connection | null,
  now: number,
  /** Who is behind, when the Connection closed a socket running another Release. */
  behind: Behind | null = null,
): Pill | null => {
  const notice = pluginNotice(connection, now, behind);
  if (notice?._tag === 'Updating') {
    const percent = percentOf(notice.progress);
    return [
      `Updating Connect…${percent === null ? '' : ` ${percent}%`}`,
      'The Connection is updating its code Plugin. Its tunnel stays up; a session may pause for a moment.',
      'bg-warning',
    ];
  }
  if (notice?._tag === 'Crashed')
    return [
      'The code Plugin stopped',
      `The Connection's code Plugin stopped; trying again ${retryIn(notice.retryAt, now)}. Its last lines are in Settings.`,
      'bg-destructive',
    ];
  if (notice?._tag === 'Stale') return ['Updating Code…', STALE, 'bg-warning'];
  if (connection !== null && outdated(connection))
    return [
      'Update ke-connect',
      `${outdatedOf(connection.version)} run \`${UPDATE_COMMAND}\` on it, then start it again.`,
      'bg-warning',
    ];
  return null;
};

/** What is said of this Code while it moves to its newest build. */
const STALE =
  'This Connection runs a newer code Plugin than this Code calls: Code is moving to its newest version.';

/** What is said of an Outdated Connection's `ke-connect`. */
const outdatedOf = (version: string) =>
  `ke-connect ${version} is older than Cloud Connect accepts;`;

/** A button that copies `text`, and says so once it did. */
function Copy({
  text,
  label,
}: {
  readonly text: string;
  readonly label: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="ghost"
      size="xs"
      className="text-muted-foreground"
      aria-label={label}
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => setCopied(true));
      }}
    >
      {copied ? <CheckIcon aria-hidden /> : <CopyIcon aria-hidden />}
      {copied ? 'Copied' : 'Copy'}
    </Button>
  );
}

function Updating({
  notice,
}: {
  readonly notice: Extract<PluginNotice, { _tag: 'Updating' }>;
}) {
  const { progress } = notice;
  const percent = percentOf(progress);
  return (
    <div role="status" className="flex flex-col gap-1.5">
      <p className="text-xs text-muted-foreground tabular-nums">
        {progress === null
          ? 'Updating Connect: starting the new version'
          : progress.total === null
            ? `Updating Connect: ${megabytes(progress.received)} so far`
            : `Updating Connect: ${megabytes(progress.received)} of ${megabytes(progress.total)}`}
        . The tunnel stays up.
      </p>
      <Progress aria-label="Updating Connect" value={percent} />
    </div>
  );
}

function Crashed({
  notice,
  now,
}: {
  readonly notice: Extract<PluginNotice, { _tag: 'Crashed' }>;
  readonly now: number;
}) {
  const lines = notice.log.join('\n');
  return (
    <div role="alert" className="flex flex-col gap-2">
      <p className="flex items-center gap-2 text-sm text-destructive">
        <CircleAlertIcon aria-hidden className="size-3.5 shrink-0" />
        <span className="min-w-0 break-words">
          The code Plugin stopped; trying again {retryIn(notice.retryAt, now)}.
        </span>
      </p>
      {notice.log.length > 0 && (
        <details className="group rounded-md border border-border">
          <summary className="focus-ring flex cursor-pointer items-center justify-between gap-2 px-3 py-1.5 text-xs text-muted-foreground select-none">
            Its last{' '}
            {notice.log.length === 1 ? 'line' : `${notice.log.length} lines`}
          </summary>
          <div className="flex flex-col gap-1 border-t border-border p-2">
            <pre className="max-h-48 overflow-auto font-mono text-[11px] leading-snug break-words whitespace-pre-wrap">
              {lines}
            </pre>
            <div className="flex justify-end">
              <Copy text={lines} label="Copy its last lines" />
            </div>
          </div>
        </details>
      )}
    </div>
  );
}

function Update({ version }: { readonly version: string }) {
  return (
    <div role="status" className="flex flex-col gap-1.5">
      <p className="text-xs text-muted-foreground">
        Update ke-connect: {outdatedOf(version)} run this on it, then start it
        again:
      </p>
      <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 py-1 pr-1 pl-3">
        <code className="min-w-0 flex-1 truncate font-mono text-xs">
          {UPDATE_COMMAND}
        </code>
        <Copy text={UPDATE_COMMAND} label="Copy the update command" />
      </div>
    </div>
  );
}

/** The whole of what the app says of a Connection's code Plugin and `ke-connect`, for Settings; nothing when all is well. */
export function ConnectionNotice({
  connection,
  now,
  behind = null,
}: {
  readonly connection: Connection;
  readonly now: number;
  /** Who is behind, when the Connection closed a socket running another Release. */
  readonly behind?: Behind | null;
}) {
  const notice = pluginNotice(connection, now, behind);
  const update = outdated(connection);
  if (notice === null && !update) return null;
  return (
    <div className="flex flex-col gap-3">
      {notice?._tag === 'Updating' && <Updating notice={notice} />}
      {notice?._tag === 'Crashed' && <Crashed notice={notice} now={now} />}
      {notice?._tag === 'Stale' && (
        <p role="status" className="text-xs text-muted-foreground">
          {STALE}
        </p>
      )}
      {update && <Update version={connection.version} />}
    </div>
  );
}
