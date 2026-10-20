import { createTheme } from '@kestack/web-theme';
import { Moon, Sun } from 'lucide-react';
import { useMemo } from 'react';

/*
 * The Theme, @kestack/web-theme's as in every kstack app: light or dark, as
 * `data-theme` on the root. The Document's head script sets it before the
 * first paint, from the `kui-theme` cookie on the Shared Cookie Domain or,
 * with none yet, from the system. The toggle saves the cookie and redraws
 * at once, with every transition held for that frame.
 */

/**
 * One 44px icon button: the icon and label name the Theme it switches to.
 * The icon follows the root's `data-theme` in CSS, so it is right on the
 * first paint even when only the browser knows the system's Theme.
 */
export function ThemeToggle({ cookieDomain }: { cookieDomain: string }) {
  const { useTheme } = useMemo(
    () => createTheme({ cookieDomain }),
    [cookieDomain],
  );
  const { theme, toggleTheme } = useTheme();
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <button
      type="button"
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      onClick={toggleTheme}
      className="grid size-11 shrink-0 place-items-center rounded-lg text-muted-foreground transition-[background-color,color,scale] duration-150 ease-out hover:bg-accent hover:text-foreground active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100"
    >
      <Moon aria-hidden="true" className="size-5 dark:hidden" />
      <Sun aria-hidden="true" className="hidden size-5 dark:block" />
    </button>
  );
}
