import { Spinner } from '@kestack/web-platform/ui/components/spinner';
import { TriangleAlertIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { shortenHome } from '../../../../../server/rpc/contract/index.js';

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

export function Rereading({ children }: { children: ReactNode }) {
  return (
    <div className="pointer-events-none absolute top-3 left-3 z-10 flex items-center gap-2 rounded-full bg-popover/90 px-2.5 py-1 text-xs text-muted-foreground shadow-sm ring-1 ring-border/60 backdrop-blur-sm">
      <Spinner className="size-3" />
      {children}
    </div>
  );
}
