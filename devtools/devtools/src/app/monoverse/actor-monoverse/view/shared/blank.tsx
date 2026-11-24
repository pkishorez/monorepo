import { Button } from '@kestack/web-platform/ui/components/button';
import { Spinner } from '@kestack/web-platform/ui/components/spinner';
import { FolderOpenIcon, RotateCwIcon, TriangleAlertIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { shortenHome } from '../../../server/rpc/contract/index.js';

/*
 * What Monoverse shows where there is no tree to draw: while something is
 * read, when it cannot be, and while a tree already drawn is read again.
 */

/** Something being read, centred where its tree will be. */
export function Waiting({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <p className="flex items-center gap-2.5 text-sm text-muted-foreground">
        <Spinner className="size-3.5 opacity-70" />
        {children}
      </p>
    </div>
  );
}

/** A project's folder being opened. */
export function Opening({ root }: { root: string | null }) {
  return (
    <Waiting>
      {root === null ? 'Finding the project…' : `Opening ${shortenHome(root)}…`}
    </Waiting>
  );
}

/** Why something could not be read, and what to do next. */
export function Problem({
  title,
  problem,
  path,
  children,
}: {
  title: string;
  problem: string;
  path?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div
        role="alert"
        className="flex max-w-sm flex-col items-center gap-3 text-center"
      >
        <span className="flex size-9 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <TriangleAlertIcon className="size-4" />
        </span>
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-medium text-balance">{title}</h2>
          <p className="text-sm text-pretty text-muted-foreground">{problem}</p>
          {path === undefined ? null : (
            <p className="font-mono text-xs break-all text-muted-foreground/80">
              {shortenHome(path)}
            </p>
          )}
        </div>
        {children === undefined ? null : (
          <div className="mt-1 flex flex-wrap justify-center gap-2">
            {children}
          </div>
        )}
      </div>
    </div>
  );
}

/** The project's folder could not be opened. */
export function CannotOpen({
  root,
  problem,
  missing,
  onRetry,
  onPickAnother,
}: {
  root: string;
  problem: string;
  /** The folder is gone, or holds no project. */
  missing: boolean;
  onRetry: () => void;
  onPickAnother: () => void;
}) {
  return (
    <Problem
      title={missing ? 'No project here' : 'Could not open this project'}
      problem={problem}
      path={root}
    >
      <Button type="button" variant="outline" size="sm" onClick={onRetry}>
        <RotateCwIcon />
        Try again
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={onPickAnother}>
        <FolderOpenIcon />
        Open another
      </Button>
    </Problem>
  );
}

/** A tree on screen being read again, at another branch: a quiet note over its corner. */
export function Rereading({ children }: { children: ReactNode }) {
  return (
    <div className="pointer-events-none absolute top-3 left-3 z-10 flex items-center gap-2 rounded-full bg-popover/90 px-2.5 py-1 text-xs text-muted-foreground shadow-sm ring-1 ring-border/60 backdrop-blur-sm">
      <Spinner className="size-3" />
      {children}
    </div>
  );
}
