import { Button } from 'kui-toolkit/components/ui/button';
import { Moon, Sun } from 'kui-toolkit/lucide';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const isDark = theme !== 'light';
  return (
    <div className="fixed top-4 right-4 z-10">
      <Button
        variant="ghost"
        size="icon"
        aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
        className="relative text-muted-foreground before:absolute before:-inset-1 hover:text-foreground"
        onClick={() => setTheme(isDark ? 'light' : 'dark')}
      >
        {isDark ? <Sun /> : <Moon />}
      </Button>
    </div>
  );
}
