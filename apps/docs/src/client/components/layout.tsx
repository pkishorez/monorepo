import type { ReactNode } from 'react';
import { Footer } from './footer.tsx';
import { Header } from './header.tsx';
import { Progress } from './progress.tsx';

/**
 * What is around every page: a bar while the Router holds a move, the
 * header, the page and the footer, the same on every page.
 */
export function Layout({ children }: { readonly children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <Progress />
      <Header />
      <div className="flex-1">{children}</div>
      <Footer />
    </div>
  );
}
