import { Spinner } from '@kestack/web-platform/ui/components/spinner';
import type { ReactNode } from 'react';

import { shortenHome } from '../../../server/rpc/contract/index.js';

/*
 * What Monoverse shows where there is no tree to draw yet: something
 * being read, such as the project's folder being opened.
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
