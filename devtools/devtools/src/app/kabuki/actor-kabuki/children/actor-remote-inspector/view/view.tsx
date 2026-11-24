import type { ReactNode } from 'react';

/* The Inspector filling what holds it, laid out by its own width. */

export function Body({ inspector }: { readonly inspector: ReactNode }) {
  return (
    <div className="@container relative flex min-h-0 flex-1 flex-col overflow-hidden bg-background text-foreground">
      {inspector}
    </div>
  );
}
