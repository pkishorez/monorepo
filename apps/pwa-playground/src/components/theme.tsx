import { Button } from '@kstackz/ui-toolkit/components/ui/button';
import { MoonIcon, SunIcon } from '@kstackz/ui-toolkit/lucide';
import { appTheme } from '../lib/theme.ts';

export { appTheme } from '../lib/theme.ts';

export function ThemeToggle() {
  const { toggleTheme } = appTheme.useTheme();

  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-11 touch-manipulation sm:size-9"
      aria-label="Toggle dark mode"
      data-testid="theme-toggle"
      onClick={toggleTheme}
    >
      {/* Both icons render; CSS picks one, so the right icon is there on first paint. */}
      <SunIcon aria-hidden="true" className="hidden dark:block" />
      <MoonIcon aria-hidden="true" className="dark:hidden" />
    </Button>
  );
}
