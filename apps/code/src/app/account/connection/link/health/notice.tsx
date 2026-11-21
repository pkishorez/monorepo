import type { Connection as ConnectionSchema } from '@kestack/connect/cloud';
import { Button } from '@kestack/web-platform/ui/components/button';
import { CheckIcon, CopyIcon } from 'lucide-react';
import { useState } from 'react';
import type { Behind } from '../reach/index.ts';
import { outdated, pluginNotice, UPDATE_COMMAND } from './health.ts';

type Connection = typeof ConnectionSchema.Type;

/*
 * What the app says of a Connection's own programs, linked or not: Connect
 * catching up with this Code, or this Code moving to its newest build, as
 * Connect Cloud says once the Connection refused its Release; and, when it is
 * Outdated, its `ke-connect` older than Connect Cloud accepts, how to update
 * it. Otherwise it says nothing. The header's pill says it in a few words, and
 * Settings in full.
 */

type Pill = readonly [label: string, title: string, tone: string];

/** What the pill says of the code Plugin or `ke-connect`, more on hover, and its colour; null when there is nothing to say. */
export const noticePillOf = (
  connection: Connection | null,
  /** Who Connect Cloud says is behind, once the Connection closed a socket running another Release. */
  behind: Behind | null = null,
): Pill | null => {
  const notice = pluginNotice(behind);
  if (notice?._tag === 'Updating')
    return [
      'Updating Connect…',
      'Connect is catching up with this Code. Its tunnel stays up; a session may pause for a moment.',
      'bg-warning',
    ];
  if (notice?._tag === 'Stale') return ['Updating Code…', STALE, 'bg-warning'];
  if (connection !== null && outdated(connection))
    return [
      'Update ke-connect',
      `${outdatedOf(connection.version)} ${UPDATE_COMMAND}`,
      'bg-warning',
    ];
  return null;
};

/** What is said of this Code while it moves to its newest build. */
const STALE = 'A newer Code is out: Code is moving to its newest version.';

/** What is said of an Outdated Connection's `ke-connect`, before the command that updates it. */
const outdatedOf = (version: string) =>
  `This computer runs ke-connect ${version}, older than Connect Cloud accepts, so Code does not connect to it. Update it, then start it again:`;

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

function Update({ version }: { readonly version: string }) {
  return (
    <div role="status" className="flex flex-col gap-1.5">
      <p className="text-xs text-muted-foreground">{outdatedOf(version)}</p>
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
  behind = null,
}: {
  readonly connection: Connection;
  /** Who Connect Cloud says is behind, once the Connection closed a socket running another Release. */
  readonly behind?: Behind | null;
}) {
  const notice = pluginNotice(behind);
  const update = outdated(connection);
  if (notice === null && !update) return null;
  return (
    <div className="flex flex-col gap-3">
      {notice?._tag === 'Updating' && (
        <p role="status" className="text-xs text-muted-foreground">
          Updating Connect: catching up with this Code. The tunnel stays up.
        </p>
      )}
      {notice?._tag === 'Stale' && (
        <p role="status" className="text-xs text-muted-foreground">
          {STALE}
        </p>
      )}
      {update && <Update version={connection.version} />}
    </div>
  );
}
