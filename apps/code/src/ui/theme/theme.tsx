import { Button } from '@kestack/web-platform/ui/components/button';
import { MoonIcon, SunIcon } from '@kestack/web-platform/ui/components/lucide';
import { createTheme } from '@kestack/web-platform/ui/theme';

/* Light or dark, kept in a cookie for this host alone: the app is local. */
export const Theme = createTheme({ cookieDomain: undefined });

/** Switches to the other theme; the icon follows `<html>`, so it is right from the first paint. */
export function ThemeToggle() {
  const { toggleTheme } = Theme.useTheme();
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={toggleTheme}
      aria-label="Switch theme"
      className="shrink-0 text-muted-foreground max-md:size-11 max-md:rounded-full"
    >
      <MoonIcon className="dark:hidden" />
      <SunIcon className="hidden dark:block" />
    </Button>
  );
}
