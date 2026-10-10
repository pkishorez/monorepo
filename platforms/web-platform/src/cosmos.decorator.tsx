import { Moon, Sun } from 'lucide-react';
import type { ReactNode } from 'react';
import { createTheme } from './theme';
import './theme/css/global.css';

const themeController = createTheme();

export default function CosmosDecorator({ children }: { children: ReactNode }) {
  const { theme, toggleTheme } = themeController.useTheme();

  return (
    <>
      <div className="bg-background text-foreground min-h-svh">{children}</div>
      <button
        onClick={toggleTheme}
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
    </>
  );
}
