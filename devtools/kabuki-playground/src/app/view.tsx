import type { ReactNode } from 'react';
import { ThemeToggle } from './theme.tsx';

export function Body({ page }: { readonly page: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground antialiased">
      <header className="border-b border-border">
        <div className="mx-auto flex h-12 w-full max-w-xl items-center justify-between px-5">
          <span className="text-sm font-medium">Kabuki Playground</span>
          <ThemeToggle />
        </div>
      </header>
      <main className="flex-1">
        {page ?? (
          <p className="px-8 py-16 text-center text-sm text-muted-foreground">
            There is nothing at this address. The to-dos are at /.
          </p>
        )}
      </main>
    </div>
  );
}
