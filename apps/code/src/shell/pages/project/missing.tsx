import { FolderXIcon } from '@kestack/web-platform/ui/components/lucide';
import type { ReactNode } from 'react';
import { Draft } from './draft/index.ts';

/*
 * A project whose folder is missing, as its Machine last found it: above
 * the Draft, that the folder no longer exists, with Remove beside it; the
 * Draft under it sends nothing, so no new session starts. Its sessions
 * stay readable.
 */

/** Why no new session can start here, with Remove beside it. */
export function FolderMissing({
  path,
  remove,
}: {
  readonly path: string;
  readonly remove: ReactNode;
}) {
  return (
    <div
      role="status"
      className="mt-2 flex flex-col items-start gap-3 rounded-lg border border-border bg-muted/40 p-3 sm:flex-row sm:items-center"
    >
      <p className="flex min-w-0 flex-1 items-start gap-2 text-sm">
        <FolderXIcon
          aria-hidden
          className="mt-0.5 size-4 shrink-0 text-warning"
        />
        <span className="min-w-0 [overflow-wrap:anywhere]">
          The folder <span className="font-mono text-xs">{path}</span> no longer
          exists. Put it back to start a new session here; its sessions stay
          readable.
        </span>
      </p>
      {remove}
    </div>
  );
}

/** The Draft, sending nothing while the folder is missing. */
export function DraftFor({
  missing,
  children,
}: {
  readonly missing: boolean;
  readonly children: ReactNode;
}) {
  return <Draft.Slots value={{ blocked: missing }}>{children}</Draft.Slots>;
}
