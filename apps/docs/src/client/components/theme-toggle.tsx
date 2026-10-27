import { Button } from '@kestack/web-platform/ui/components/button';
import { MoonIcon, SunIcon } from 'lucide-react';
import { Theme } from './theme.ts';

/** Switches to the other theme; the icon follows `<html>`, so it is right from the first paint. */
export function ThemeToggle() {
  const { toggleTheme } = Theme.useTheme();
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={toggleTheme}
      aria-label="Switch theme"
      className="shrink-0 text-muted-foreground"
    >
      <MoonIcon className="dark:hidden" />
      <SunIcon className="hidden dark:block" />
    </Button>
  );
}
