import { ThemeProvider } from 'next-themes';
import type { ReactNode } from 'react';
import './styles/global.css';

export default function CosmosDecorator({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="data-theme" defaultTheme="dark">
      <div className="bg-background text-foreground min-h-svh">{children}</div>
    </ThemeProvider>
  );
}
