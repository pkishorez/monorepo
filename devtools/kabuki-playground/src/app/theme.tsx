import { MoonIcon, SunIcon } from 'lucide-react';
import { Button } from '@kestack/web-platform/ui/components/button';
import { createTheme } from '@kestack/web-platform/ui/theme';

export const Theme = createTheme({ cookieDomain: undefined });

export function ThemeToggle() {
  const { toggleTheme } = Theme.useTheme();
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={toggleTheme}
      aria-label="Switch theme"
      className="text-muted-foreground"
    >
      <MoonIcon className="dark:hidden" />
      <SunIcon className="hidden dark:block" />
    </Button>
  );
}
