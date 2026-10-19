import { Moon, Sun } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import type { Theme } from '../api/index.ts';

/*
 * The Theme: light or dark, as `data-theme` on the root. The Document's
 * script sets it before the first paint, from the `theme` cookie on the
 * Shared Cookie Domain or, with none yet, from the system. The toggle writes
 * the cookie and redraws at once, with every transition held for that frame
 * so nothing fades across.
 */

const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const drawn = (): Theme =>
  document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';

const switchTheme = (theme: Theme, cookieDomain: string) => {
  const secure = location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `theme=${theme}; Domain=${cookieDomain}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
  const still = document.createElement('style');
  still.textContent = '*,*::before,*::after{transition:none!important}';
  document.head.appendChild(still);
  document.documentElement.dataset.theme = theme;
  listeners.forEach((listener) => listener());
  requestAnimationFrame(() => requestAnimationFrame(() => still.remove()));
};

/**
 * One 44px icon button: the icon and label name the Theme it switches to.
 * The icon follows the root's `data-theme` in CSS, so it is right on the
 * first paint even when only the browser knows the system's Theme.
 */
export function ThemeToggle({
  saved,
  cookieDomain,
}: {
  /** The Theme in the `theme` cookie, as the server read it. */
  saved: Theme | null;
  cookieDomain: string;
}) {
  const theme = useSyncExternalStore(subscribe, drawn, () => saved ?? 'light');
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <button
      type="button"
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      onClick={() => switchTheme(next, cookieDomain)}
      className="grid size-11 shrink-0 place-items-center rounded-lg text-muted-fg transition-[background-color,color,scale] duration-150 ease-out hover:bg-hover hover:text-fg active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100"
    >
      <Moon aria-hidden="true" className="size-5 in-data-[theme=dark]:hidden" />
      <Sun
        aria-hidden="true"
        className="hidden size-5 in-data-[theme=dark]:block"
      />
    </button>
  );
}
