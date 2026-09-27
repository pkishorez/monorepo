import { Button } from 'kui-toolkit/components/ui/button';
import { MoonIcon, SunIcon } from 'kui-toolkit/lucide';
import { useEffect } from 'react';

const STORAGE_KEY = 'pwa-playground:theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

/**
 * Runs in <head> before first paint: the stored choice, else the system's.
 * Inline so the App Shell and the Offline Fallback get it too, with no flash.
 */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('${STORAGE_KEY}');var d=t?t==='dark':matchMedia('${DARK_QUERY}').matches;document.documentElement.classList.toggle('dark',d)}catch(e){}})()`;

const applyTheme = (dark: boolean) => {
  // Swap every token at once instead of letting each transition run its own course.
  const freeze = document.createElement('style');
  freeze.textContent = '*,*::before,*::after{transition:none!important}';
  document.head.appendChild(freeze);
  document.documentElement.classList.toggle('dark', dark);
  requestAnimationFrame(() => requestAnimationFrame(() => freeze.remove()));
};

/** Light/dark switch; follows the system until the user picks one. */
export function ThemeToggle() {
  useEffect(() => {
    const media = window.matchMedia(DARK_QUERY);
    const follow = () => {
      if (localStorage.getItem(STORAGE_KEY) === null) applyTheme(media.matches);
    };
    media.addEventListener('change', follow);
    return () => media.removeEventListener('change', follow);
  }, []);

  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-11 touch-manipulation sm:size-9"
      aria-label="Toggle dark mode"
      data-testid="theme-toggle"
      onClick={() => {
        const dark = !document.documentElement.classList.contains('dark');
        localStorage.setItem(STORAGE_KEY, dark ? 'dark' : 'light');
        applyTheme(dark);
      }}
    >
      {/* Both icons render; CSS picks one, so the right icon is there on first paint. */}
      <SunIcon aria-hidden="true" className="hidden dark:block" />
      <MoonIcon aria-hidden="true" className="dark:hidden" />
    </Button>
  );
}
