import { createTheme } from '@kestack/web-platform/theme';
import { Moon, Sun } from 'lucide-react';
import { cn } from '@kestack/web-platform/components/utils';

const cookieDomain =
  typeof location === 'undefined'
    ? undefined
    : location.hostname.endsWith('.kishore.app')
      ? 'kishore.app'
      : location.hostname.endsWith('.kishore.computer')
        ? 'kishore.computer'
        : undefined;

export const appTheme = createTheme({ cookieDomain });

/** Fixed in the page's top-right corner, unless `className` places it, such as inline in a header. */
export function ThemeToggle({
  className = 'fixed top-5 right-5',
}: {
  readonly className?: string;
}) {
  const { theme, toggleTheme } = appTheme.useTheme();
  const label =
    theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={toggleTheme}
      className={cn(
        'rounded-full p-2 text-muted-foreground/60 transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        className,
      )}
    >
      {theme === 'dark' ? (
        <Sun className="size-4" />
      ) : (
        <Moon className="size-4" />
      )}
    </button>
  );
}
