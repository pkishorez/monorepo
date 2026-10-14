import { Button } from '@kestack/web-platform/components/button';
import { MoonIcon, SunIcon } from '@kestack/web-platform/components/lucide';
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
      className="order-2 ml-auto text-muted-foreground sm:order-3"
    >
      <MoonIcon className="dark:hidden" />
      <SunIcon className="hidden dark:block" />
    </Button>
  );
}
