import { ThemeProvider } from 'next-themes';
import { Moon, Sun } from 'lucide-react';
import { useState } from 'react';
import type { ReactNode } from 'react';
import './styles/global.css';

const STORAGE_KEY = 'cosmos-theme';

export default function CosmosDecorator({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<'dark' | 'light'>(
    () => (localStorage.getItem(STORAGE_KEY) as 'dark' | 'light') ?? 'dark',
  );

  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem(STORAGE_KEY, next);
    setTheme(next);
  }

  return (
    <ThemeProvider attribute="data-theme" forcedTheme={theme}>
      <div className="bg-background text-foreground min-h-svh">{children}</div>
      <button
        onClick={toggle}
        aria-label="Toggle theme"
        style={{
          position: 'fixed',
          bottom: 16,
          right: 16,
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 36,
          height: 36,
          borderRadius: '50%',
          border: '1px solid #444',
          background: theme === 'dark' ? '#1a1a1a' : '#f5f5f5',
          color: theme === 'dark' ? '#fff' : '#000',
          cursor: 'pointer',
        }}
      >
        {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
      </button>
    </ThemeProvider>
  );
}
