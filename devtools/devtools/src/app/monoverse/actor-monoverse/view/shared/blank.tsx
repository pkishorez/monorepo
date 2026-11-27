import { Spinner } from '@kestack/web-platform/ui/components/spinner';
import type { ReactNode } from 'react';

import { shortenHome } from '../../../server/rpc/contract/index.js';

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

export function Opening({ root }: { root: string | null }) {
  return (
    <Waiting>
      {root === null ? 'Finding the project…' : `Opening ${shortenHome(root)}…`}
    </Waiting>
  );
}
