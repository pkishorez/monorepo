import { createTheme } from 'kui-toolkit/components/blocks/theme';
import { Button } from 'kui-toolkit/components/ui/button';
import { Moon, Sun } from 'kui-toolkit/lucide';

const cookieDomain =
  typeof location === 'undefined'
    ? undefined
    : location.hostname.endsWith('.kishore.app')
      ? 'kishore.app'
      : location.hostname.endsWith('.kishore.computer')
        ? 'kishore.computer'
        : undefined;

export const appTheme = createTheme({ cookieDomain });

export function ThemeToggle() {
  const { theme, toggleTheme } = appTheme.useTheme();
  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-9"
      aria-label="Toggle theme"
      title="Toggle theme"
      onClick={toggleTheme}
    >
      {theme === 'dark' ? <Sun /> : <Moon />}
    </Button>
  );
}
