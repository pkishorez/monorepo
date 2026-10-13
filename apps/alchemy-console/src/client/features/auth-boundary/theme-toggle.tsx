import { createTheme } from '@kestack/web-platform/theme';
import { Button } from '@kestack/web-platform/components/button';
import { Moon, Sun } from '@kestack/web-platform/components/lucide';

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
