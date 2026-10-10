import { Moon, Sun } from 'lucide-react';

import { Button } from '../../components/button';
import { createTheme } from '../../theme';

const themeController = createTheme();

export function ThemeToggle() {
  const { theme, toggleTheme } = themeController.useTheme();
  const dark = theme === 'dark';
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      className="relative text-muted-foreground before:absolute before:-inset-1 hover:text-foreground"
      onClick={toggleTheme}
    >
      {dark ? <Sun /> : <Moon />}
    </Button>
  );
}
